let cart_label = document.getElementById('cart_label');
let cart_upsell = document.getElementById('cart_upsell_products');
let cart_items = document.getElementById('cart_items');
let cart_button = document.getElementById('cart_button');
let checkout_button = document.getElementById('checkout_button');
let product_add_panel = document.getElementById('product_add_panel');
let basket = JSON.parse(localStorage.getItem("data")) || [];
let cart_panel = document.getElementById('cart_panel');
let cart_close_button = document.getElementById('cart_close_button');
let link_discord_button = document.getElementById('link_discord_button');

async function getProduct(productHandle) {
  try {
    const response = await fetch(`http://localhost:3000/api/shopify/getProduct/${encodeURIComponent(productHandle)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.data.productByHandle;
  } catch (error) {
    console.error(`Error fetching product (${productHandle}):`, error);
    throw error;
  }
}

async function getCollection(collectionId) {
  try {
    const response = await fetch(`http://localhost:3000/api/shopify/getCollection/${encodeURIComponent(collectionId)}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    const collection = data.collection;
    
    return collection;
  } catch (error) {
    console.error('Error fetching featured collection:', error);
    throw error;
  }
}

let increment = async (id) => {
    let search = basket.find((x) => x.id === id);

    if (search) {
        search.item += 1;
    } else {
        basket.push({
            id: id,
            item: 1,
        });
    }

    localStorage.setItem("data", JSON.stringify(basket));
    await generateCartItems();
    await update(id);
};

let decrement = async (id) => {
    let search = basket.find((x) => x.id === id);

    if (search === undefined) return;
    else if (search.item === 0) return;
    else {
        search.item -= 1;
    }
    
    await update(id);

    basket = basket.filter((x) => x.item !== 0);
    localStorage.setItem("data", JSON.stringify(basket));
};

let update = async (id) => {
    let search = basket.                                  find((x) => x.id === id);

    document.getElementById(id).innerHTML = search.item;

    getProduct(id).then(product => {
        const productMinPrice = Number(product.priceRange.minVariantPrice.amount) * search.item;
        document.getElementById(id).parentElement.querySelector('.cart_item_price').innerHTML = `$${productMinPrice.toFixed(2)}`;
        if (product_add_panel !== null) {
            product_add_panel.querySelector('.cart_item_amount').innerHTML = search.item;
            product_add_panel.querySelector('.cart_item_price').innerHTML = `$${productMinPrice.toFixed(2)}`;
        }
    });
};

let removeItem = async (id) => {
    basket = basket.filter((x) => x.id !== id)
    localStorage.setItem("data", JSON.stringify(basket));
    await generateCartItems();
    await generateUpsellItems();
};

let clearCart = async () => {
    basket = []
    localStorage.setItem("data", JSON.stringify(basket));
    await generateCartItems();
    await generateUpsellItems();
}

let totalAmount = () => {
    if (basket.length !== 0) {
        let amount = basket.map((x) => {
            let { item, id } = x;
            let search = shopItemsData.find(y => y.ids.find(z => z === id));
            let index = search.ids.indexOf(id);
            return item * search.prices[index];
        }).reduce((x, y) => x+y, 0);

        submit_button.value = `Checkout ($${(Math.round(amount * 100) / 100).toFixed(2)})`
    } else return;
};

let generateUpsellItems = async () => {
    let collection = await getCollection("324227399870");
    let upsellProducts = [];

    cart_upsell.innerHTML = "";

    for (let i = 0; i < 3; i++) {
        for (const edge of collection.products.edges) {
            const handle = edge.node.handle;
            if (!handle) continue;
            if (!basket.find(x => x.id === handle) && !upsellProducts.find(x => x.handle === handle)) {
                upsellProducts.push(await getProduct(handle));
                break; // Suggest the first product not in basket
            }
        }
    }

    if (upsellProducts.length > 0) {
        upsellProducts.forEach(upsellProduct => {
            const productTitle = upsellProduct.title;
            const productMinPrice = Number(upsellProduct.priceRange.minVariantPrice.amount);
            const imageUrl = upsellProduct.images.edges[0]?.node.url;

            let cartItem = document.createElement("div");
            cartItem.classList.add("cart_upsell_item");
            cartItem.innerHTML = `
                <img class="cart_item_image" src="${imageUrl}" alt="${productTitle}">
                <div class="cart_item_info">
                    <h2 class="cart_item_title">${productTitle}</h2>
                    <h2 class="cart_item_price">$${productMinPrice.toFixed(2)}</h2>
                </div>
            `;
            cart_upsell.appendChild(cartItem);

            cartItem.addEventListener('click', async function() {
                await increment(upsellProduct.handle);
                await generateUpsellItems();
            });
        });
    }
}

let generateCartItems = async () => {
    if (basket.length === 0) {
        cart_label.innerHTML = `
            Your cart is empty
            <a href="products.html">
                <button class="shop_button">Shop Now</button>
            </a>`;
        return;
    }

    cart_items.innerHTML = "";

    basket.forEach(item => {
        getProduct(item.id).then(product => {
            const productTitle = product.title;
            const productMinPrice = Number(product.priceRange.minVariantPrice.amount) * item.item;
            const imageUrl = product.images.edges[0]?.node.url;

            let cartItem = document.createElement("div");
            cartItem.classList.add("cart_item");
            cartItem.innerHTML = `
                <img class="cart_item_image" src="${imageUrl}" alt="${productTitle}"></img>
                <div class="cart_item_info">
                    <h2 class="cart_item_title">
                        ${productTitle}
                        <i class="fa-solid fa-xmark" onclick="removeItem('${item.id}')"></i>
                    </h2>
                    <div class="cart_item_quantity">
                        <h2 class="cart_item_price">$${productMinPrice.toFixed(2)}</h2>
                        <i class="fa-solid fa-minus" onclick="decrement('${item.id}')"></i>
                        <div id="${item.id}" class="cart_item_amount">${item.item}</div>
                        <i class="fa-solid fa-plus" onclick="increment('${item.id}')"></i>
                    </div>
                </div>
            `;
            
            cart_items.appendChild(cartItem);
        });
    });
};

async function linkDiscord() {
    window.location.href = `http://localhost:3000/login`;
    //window.location.href = `http://localhost:3000/login?redirect=${encodeURIComponent(redirectPage)}`;
}

async function checkoutWithShopify() {
    const cart = JSON.parse(localStorage.getItem("data")) || [];
    const sessionId = getCookie('session_id');
        
    if (cart.length === 0) {
        return;
    }

    checkout_button.innerHTML = "Loading..."

    try {
        const syncResponse = await fetch(`http://localhost:3000/api/cart/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`
            },
            body: JSON.stringify({ items: cart })
        });

        if (!syncResponse.ok) {
            throw new Error(`HTTP error! status: ${syncResponse.status}`);
        }

        const data = await syncResponse.json();

        if (data.unavailableItems && data.unavailableItems.length > 0) {
            console.log('Unavailable items:', data.unavailableItems);
        }

        const guildRes = await fetch('http://localhost:3000/api/check-guild', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${sessionId}`
            }
        });

        const guildData = await guildRes.json();

        if (guildData.inGuild === true) {
            window.open(data.checkoutUrl, '_blank');
        } else {
            checkout_button.innerHTML = "Joining Discord..."
            const joinRes = await fetch(`http://localhost:3000/api/join-guild`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionId}`
                }
            });

            if (!joinRes.ok) {
                throw new Error(`HTTP error! status: ${joinRes.status}`);
            }

            const joinData = await joinRes.json();

            if (joinData.result === true) {
                window.open(data.checkoutUrl, '_blank');
            }
        }
                
    } catch (error) {
        console.error('Checkout error:', error);
    }
}

function getCookie(cname) {
  let name = cname + "=";
  let decodedCookie = decodeURIComponent(document.cookie);
  let ca = decodedCookie.split(';');
  for(let i = 0; i <ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

checkout_button.addEventListener('click', checkoutWithShopify);

cart_button.addEventListener('click', async function() {
    cart_panel.classList.toggle('closed');
    try {
        const sessionId = getCookie('session_id');
        
        const meRes = await fetch('http://localhost:3000/api/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${sessionId}`
            }
        });

        const meData = await meRes.json();
        
        if (meData.authorized === true) {
            console.log(meData);

            cart_panel.querySelector('.link_discord').classList.add('hidden');
            cart_panel.querySelector('.checkout').classList.remove('hidden');
            cart_panel.querySelector('.discord_username').innerHTML = meData.user.username;
            cart_panel.querySelector('.discord_avatar').src = meData.user.avatar;
        }

    } catch (err) {
        console.error('Error checking auth:', err);
    }
});

document.addEventListener("DOMContentLoaded", function() {
    basket.forEach(item => {
        getProduct(item.id).then(product => {
            if (product.totalInventory <= 0) {
                removeItem(item.id);
            }
        });
    });
});

cart_close_button.addEventListener('click', function() {
    cart_panel.classList.add('closed');
});

link_discord_button.addEventListener('click', async function() {
    await linkDiscord();
})

generateCartItems();
generateUpsellItems();

// clear_cart_button.addEventListener('click', clearCart)
//totalAmount();