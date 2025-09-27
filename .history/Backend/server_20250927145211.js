const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require("axios");
const pool = require('./db');
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');

require('dotenv').config();

const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(express.static('public'));

app.use(cors({
  origin: ['http://127.0.0.1:5500'], // Live Server URLs
  credentials: true
}));

app.use(express.static('public'));

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URL; // must match your Discord app settings
const GUILD_ID = process.env.DISCORD_GUILD_ID; // the server you want to check

app.get("/login", (req, res) => {
  const redirectAfterLogin = req.query.redirect || "http://127.0.0.1:5500"; // default fallback
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=code&scope=identify%20guilds%20guilds.join&state=${encodeURIComponent(redirectAfterLogin)}`;

  res.redirect(discordAuthUrl);
});

function formatDiscordUser(user) {
  // Build avatar URL (use default avatar if user has none)
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=1024`
    : `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator) % 5}.png`;

  return {
    id: user.id,
    displayName: user.global_name,
    username: user.username,
    avatar: avatarUrl,
  };
}


app.get('/api/me', async (req, res) => {
  const sessionId = req.headers.authorization?.split(' ')[1]; // extract from Bearer header
  console.log(sessionId);
  if (!sessionId) return res.status(401).json({ authorized: false });

  const session = await getUserFromSession(sessionId);
  if (!session) return res.status(401).json({ authorized: false });

  const userResponse = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${session.access_token}` }
  });
  const rawUser = await userResponse.json();

  // Format
  const user = formatDiscordUser(rawUser);

  res.json({ authorized: true, user });
});

app.get('/api/check-guild', async (req, res) => {
  const sessionId = req.headers.authorization?.split(' ')[1];
  if (!sessionId) return res.status(401).json({ authorized: false });

  const session = await getUserFromSession(sessionId);
  if (!session) return res.status(401).json({ authorized: false });

  try {
    const inGuild = await isUserInGuild(session.access_token, GUILD_ID);

    if (!inGuild) {
      //await addUserToGuild(session.access_token, GUILD_ID, session.user_id, process.env.BOT_TOKEN);
    }

    res.json({ authorized: true, inGuild });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check guild' });
  }
});

app.post('/api/join-guild', async (req, res) => {
  const sessionId = req.headers.authorization?.split(' ')[1];
  if (!sessionId) return res.status(401).json({ authorized: false });

  const session = await getUserFromSession(sessionId);
  if (!session) return res.status(401).json({ authorized: false });

  try {
    await addUserToGuild(session.access_token, GUILD_ID, session.user_id, process.env.DISCORD_BOT_TOKEN);
    res.json({ authorized: true, result: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to join guild' });
  }
})

async function isUserInGuild(accessToken, guildId) {
  const res = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const guilds = await res.json();

  return guilds.some(g => g.id === guildId);
}

async function addUserToGuild(accessToken, guildId, userId, botToken) {
  try {
    const res = await axios.put(
      `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
      {
        access_token: accessToken, // the user’s access token
      },
      {
        headers: {
          Authorization: `Bot ${botToken}`, // must be Bot token here
          "Content-Type": "application/json"
        }
      }
    );

    return res.data;
  } catch (err) {
    console.error("Failed to add user to guild:", err.response?.data || err.message);
    throw err;
  }
}

async function getUserFromSession(sessionId) {
  const result = await pool.query('SELECT * FROM sessions WHERE session_id = $1', [sessionId]);
  let session = result.rows[0];
  if (!session) return null;

  // Auto-refresh if expired
  session = await refreshAccessToken(session);
  return session;
}

async function refreshAccessToken(session) {
  if (Date.now() < session.expires_at) {
    // Token is still valid
    return session;
  }

  console.log(`Refreshing token for user ${session.user_id}...`);

  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: session.refresh_token
    })
  });

  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    throw new Error('Failed to refresh token');
  }

  // Save new tokens to DB
  await pool.query(
    `UPDATE sessions
     SET access_token = $1,
         refresh_token = $2,
         expires_at = $3
     WHERE session_id = $4`,
    [
      tokenData.access_token,
      tokenData.refresh_token || session.refresh_token, // Discord may not always return a new refresh_token
      Date.now() + tokenData.expires_in * 1000,
      session.session_id
    ]
  );

  // Return updated session
  return {
    ...session,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || session.refresh_token,
    expires_at: Date.now() + tokenData.expires_in * 1000
  };
}

// Step 2: Handle callback from Discord
app.get("/login-callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.redirect('http://127.0.0.1:5500/public/index.html');
  }

  try {
    // 1. Exchange code for access_token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      })
    });
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return res.status(400).send('Failed to exchange code');
    }

    // 2. Fetch user info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const user = await userResponse.json();

    // 3. Generate session ID
    const sessionId = uuidv4();

    // 4. Store in Postgres
    await pool.query(
      `INSERT INTO sessions (session_id, user_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id) DO UPDATE
       SET access_token = $3, refresh_token = $4, expires_at = $5`,
      [
        sessionId,
        user.id,
        tokenData.access_token,
        tokenData.refresh_token,
        Date.now() + tokenData.expires_in * 1000
      ]
    );

    // 5. Set cookie (so browser keeps sessionId)
    res.cookie('session_id', sessionId, {
      httpOnly: false,
      sameSite: 'lax',
      secure: false
    });

    // 6. Redirect wherever you want
    res.redirect('http://127.0.0.1:5500/public/products.html');

  } catch (err) {
    console.error(err);
    res.status(500).send('Error during OAuth callback');
  }
});

// SECURE: Store your Storefront Access Token in environment variables
const SHOPIFY_STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;

app.get('/api/shopify/getCollection/:collectionId', async (req, res) => {
  const query = `
    query getCollection {
      collection(id: "gid://shopify/Collection/${req.params.collectionId}") {
        id
        title
        description
        handle
        products(first: 100) {
        edges {
            node {
                handle
                }
            }
        }
      }
    }
  `;

  try {
    const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/api/2023-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }

    res.json(data.data);
  } catch (error) {
    console.error('Shopify API Error:', error);
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
});

app.get('/api/shopify/getCollections', async (req, res) => {
  const query = `
    query getCollections {
      collections(first: 10) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/api/2023-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

app.get('/api/shopify/getProduct/:product_handle', async (req, res) => {
  const query = `
    query getProduct {
        productByHandle(handle: "${req.params.product_handle}") {
            handle
            title
            totalInventory
            images(first: 1) {
                edges {
                    node {
                        url
                    }
                }
            }
            variants(first: 10) {
                edges {
                    node {
                        title
                    }
                }
            }
            priceRange {
                minVariantPrice {
                    amount
                }
            }
        }
    }
  `;

  try {
    const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/api/2023-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

async function shopifyRequest(query, variables = {}) {
  try {
    const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/api/2023-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }
    
    return data;
  } catch (error) {
    console.error('Shopify API Error:', error);
    throw error;
  }
}

app.post('/api/cart/sync', async (req, res) => {
  const { items } = req.body; // Array of {id, quantity}
  
  const sessionId = req.headers.authorization?.split(' ')[1];
  if (!sessionId) return res.status(401).json({ authorized: false });

  const session = await getUserFromSession(sessionId);
  if (!session) return res.status(401).json({ authorized: false });

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required' });
  }
  
  try {
    // Convert handles to variant IDs
    const cartLines = [];
    const unavailableItems = [];
    
    for (const item of items) {
      const productQuery = `
        query GetProductVariant($handle: String!) {
          product(handle: $handle) {
            title
            variants(first: 1) {
              edges {
                node {
                  id
                  availableForSale
                }
              }
            }
          }
        }
      `;
      
      try {
        const productData = await shopifyRequest(productQuery, { handle: item.id });
        
        if (productData.data.product?.variants.edges.length > 0) {
          const variant = productData.data.product.variants.edges[0].node;
          if (variant.availableForSale) {
            cartLines.push({
              merchandiseId: variant.id,
              quantity: item.item
            });
          } else {
            unavailableItems.push({
              handle: item.id,
              title: productData.data.product.title,
              reason: 'Not available for sale'
            });
          }
        } else {
          unavailableItems.push({
            handle: item.id,
            reason: 'Product not found'
          });
        }
      } catch (error) {
        unavailableItems.push({
          handle: item.id,
          reason: 'Error fetching product'
        });
      }
    }
    
    if (cartLines.length === 0) {
      return res.status(400).json({ 
        error: 'No available products found',
        unavailableItems 
      });
    }
    
    // Create cart
    const cartQuery = `
      mutation CartCreate($input: CartInput!) {
        cartCreate(input: $input) {
          cart {
            id
            checkoutUrl
            totalQuantity
            cost {
              totalAmount {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const data = await shopifyRequest(cartQuery, { 
      input: { 
        lines: cartLines,
        "attributes": [
          { "key": "discord_id", "value": "123456789012345678" },
          { "key": "session_id", "value": "my-session-uuid" }
        ]
      } 
    });
    
    if (data.data.cartCreate.userErrors.length > 0) {
      return res.status(400).json({ errors: data.data.cartCreate.userErrors });
    }

    console.log(unavailableItems);
    
    res.json({
      cart: data.data.cartCreate.cart,
      unavailableItems,
      checkoutUrl: data.data.cartCreate.cart.checkoutUrl
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});