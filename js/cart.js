let cart_label = document.getElementById('cart_label');
let cart_upsell = document.getElementById('cart_upsell_products');
let cart_items = document.getElementById('cart_items');
let cart_button = document.getElementById('cart_button');
let checkout_button = document.getElementById('checkout_button');
let product_add_panel = document.getElementById('product_add_panel');
let basket = JSON.parse(localStorage.getItem('data')) || [];
let cart_panel = document.getElementById('cart_panel');
let cart_close_button = document.getElementById('cart_close_button');
let link_discord_button = document.getElementById('link_discord_button');
let discord_not_you_button = document.getElementById('discord_not_you');

const BACKEND_URL = 'https://gagstore-backend.onrender.com';

async function getProducts(productHandles) {
	try {
		const handles = productHandles.map((item) => item);
		const response = await fetch(`${BACKEND_URL}/api/shopify/getProducts`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ handles }),
		});
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();
		return data;
	} catch (error) {
		console.error(`Error fetching product: `, error);
		throw error;
	}
}

async function getCollection(collectionId) {
	try {
		const response = await fetch(
			`${BACKEND_URL}/api/shopify/getCollection/${encodeURIComponent(
				collectionId
			)}`
		);

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

	await update(id);
	localStorage.setItem('data', JSON.stringify(basket));
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
	localStorage.setItem('data', JSON.stringify(basket));
};

let update = async (id) => {
	let search = basket.find((x) => x.id === id);

	if (search.item <= 0) {
		if (document.getElementById(id)) {
			document
				.getElementById(id)
				.parentElement.parentElement.parentElement.remove();
		}

		return;
	}

	if (!document.getElementById(id)) {
		await generateCartItems();
	}

	document.getElementById(id).innerHTML = search.item;

	getProducts([id]).then((products) => {
		const product = products.data['prod0'];
		const productMinPrice =
			Number(product.priceRange.minVariantPrice.amount) * search.item;
		document
			.getElementById(id)
			.parentElement.querySelector(
				'.cart_item_price'
			).innerHTML = `$${productMinPrice.toFixed(2)}`;
		if (product_add_panel !== null) {
			product_add_panel.querySelector('.cart_item_amount').innerHTML =
				search.item;
			product_add_panel.querySelector(
				'.cart_item_price'
			).innerHTML = `$${productMinPrice.toFixed(2)}`;
		}
	});
};

let removeItem = async (id) => {
	basket = basket.filter((x) => x.id !== id);
	localStorage.setItem('data', JSON.stringify(basket));

	const itemEl = document.getElementById(id)?.closest('.cart_item');
	if (itemEl) itemEl.remove();

	// 3. If cart is empty, update label
	if (basket.length === 0) {
		cart_label.innerHTML = `
			Your cart is empty
			<a href="products.html">
				<button class="shop_button">Shop Now</button>
			</a>`;
	}

	// 4. Refresh upsells (optional — can delay until later for speed)
	await generateUpsellItems();
};

let clearCart = async () => {
	basket = [];
	localStorage.setItem('data', JSON.stringify(basket));
	await generateCartItems();
	await generateUpsellItems();
};

let totalAmount = () => {
	if (basket.length !== 0) {
		let amount = basket
			.map((x) => {
				let { item, id } = x;
				let search = shopItemsData.find((y) => y.ids.find((z) => z === id));
				let index = search.ids.indexOf(id);
				return item * search.prices[index];
			})
			.reduce((x, y) => x + y, 0);

		submit_button.value = `Checkout ($${(
			Math.round(amount * 100) / 100
		).toFixed(2)})`;
	} else return;
};

let generateUpsellItems = async () => {
	let collection = await getCollection('324227399870');

	cart_upsell.innerHTML = '';

	let collectedProducts = [];

	collection.products.edges.forEach((edge) => {
		collectedProducts.push(edge.node.handle);
	});

	let productsToGet = [];

	for (let i = 0; i < 3; i++) {
		let toBreak = false;
		collectedProducts.forEach((handle) => {
			if (toBreak === false) {
				if (
					!basket.find((x) => x.id === handle) &&
					!productsToGet.find((x) => x === handle)
				) {
					productsToGet.push(handle);
					toBreak = true;
				}
			} else {
			}
		});
	}

	getProducts(productsToGet).then((products) => {
		for (let i = 0; i < productsToGet.length; i++) {
			const upsellProduct = products.data[`prod${i}`];
			const productTitle = upsellProduct.title;
			const productMinPrice = Number(
				upsellProduct.priceRange.minVariantPrice.amount
			);
			const imageUrl = upsellProduct.images.edges[0]?.node.url;

			let cartItem = document.createElement('div');
			cartItem.classList.add('cart_upsell_item');
			cartItem.innerHTML = `
                <img class="cart_item_image" src="${imageUrl}" alt="${productTitle}">
                <div class="cart_item_info">
                    <h2 class="cart_item_title">${productTitle}</h2>
                    <h2 class="cart_item_price">$${productMinPrice.toFixed(
											2
										)}</h2>
                </div>
            `;
			cart_upsell.appendChild(cartItem);

			cartItem.addEventListener('click', async function () {
				await increment(upsellProduct.handle);
				await generateUpsellItems();
			});
		}
	});
};

let generateCartItems = async () => {
	if (basket.length === 0) {
		cart_label.innerHTML = `
            Your cart is empty
            <a href="products.html">
                <button class="shop_button">Shop Now</button>
            </a>`;
		return;
	} else {
		cart_label.innerHTML = `Your Cart`;
	}

	let productsToGet = [];

	basket.forEach((x) => {
		productsToGet.push(x.id);
	});

	const products = await getProducts(productsToGet);

	const cart_items_html = basket.map((item, i) => {
		const product = products.data[`prod${i}`];
		const productTitle = product.title;
		const productMinPrice =
			Number(product.priceRange.minVariantPrice.amount) * item.item;
		const imageUrl = product.images.edges[0]?.node.url;

		//prettier-ignore
		return `
			<div class="cart_item">
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
			</div>
		`;
	});

	cart_items.innerHTML = cart_items_html.join('');
};

async function linkDiscord() {
	window.location.href = `${BACKEND_URL}/login`;
	//window.location.href = `${BACKEND_URL}/login?redirect=${encodeURIComponent(redirectPage)}`;
}

async function checkoutWithShopify() {
	const cart = JSON.parse(localStorage.getItem('data')) || [];
	const sessionId = localStorage.getItem('session_id');

	if (cart.length === 0) {
		return;
	}

	checkout_button.innerHTML = 'Loading...';

	try {
		const syncResponse = await fetch(`${BACKEND_URL}/api/cart/sync`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${sessionId}`,
			},
			body: JSON.stringify({ items: cart }),
		});

		if (!syncResponse.ok) {
			throw new Error(`HTTP error! status: ${syncResponse.status}`);
		}

		const data = await syncResponse.json();

		if (data.unavailableItems && data.unavailableItems.length > 0) {
			console.log('Unavailable items:', data.unavailableItems);
		}

		const guildRes = await fetch(`${BACKEND_URL}/api/check-guild`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${sessionId}`,
			},
		});

		const guildData = await guildRes.json();

		if (guildData.inGuild === true) {
			window.open(data.checkoutUrl, '_blank');
			checkout_button.innerHTML = 'Checkout';
		} else {
			checkout_button.innerHTML = 'Joining Discord...';
			const joinRes = await fetch(`${BACKEND_URL}/api/join-guild`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${sessionId}`,
				},
			});

			if (!joinRes.ok) {
				throw new Error(`HTTP error! status: ${joinRes.status}`);
			}

			const joinData = await joinRes.json();

			if (joinData.result === true) {
				window.open(data.checkoutUrl, '_blank');
			}

			checkout_button.innerHTML = 'Checkout';
		}
	} catch (error) {
		console.error('Checkout error:', error);
	}
}

async function handleLoginCallback() {
	const params = new URLSearchParams(window.location.search);

	const sessionId = params.get('sessionId'); // if passed via URL
	if (sessionId) {
		localStorage.setItem('session_id', sessionId);
	}
}

handleLoginCallback();

checkout_button.addEventListener('click', checkoutWithShopify);

cart_button.addEventListener('click', async function () {
	cart_panel.classList.toggle('closed');
	try {
		const sessionId = localStorage.getItem('session_id');

		const meRes = await fetch(`${BACKEND_URL}/api/me`, {
			method: 'GET',
			credentials: 'include',
			headers: {
				Authorization: `Bearer ${sessionId}`,
			},
		});

		const meData = await meRes.json();

		if (meData.authorized === true) {
			console.log(meData);

			cart_panel.querySelector('.link_discord').classList.add('hidden');
			cart_panel.querySelector('.checkout').classList.remove('hidden');
			cart_panel.querySelector('.discord_username').innerHTML =
				meData.user.username;
			cart_panel.querySelector('.discord_avatar').src = meData.user.avatar;
		} else {
			cart_panel.querySelector('.link_discord').classList.remove('hidden');
			cart_panel.querySelector('.checkout').classList.add('hidden');
		}
	} catch (err) {
		cart_panel.querySelector('.link_discord').classList.remove('hidden');
		cart_panel.querySelector('.checkout').classList.add('hidden');
		console.error('Error checking auth:', err);
	}
});

document.addEventListener('DOMContentLoaded', function () {
	let productsToGet = [];

	basket.forEach((x) => {
		productsToGet.push(x.id);
	});

	getProducts(productsToGet).then((products) => {
		for (let i = 0; i < productsToGet.length; i++) {
			const product = products.data[`prod${i}`];
			if (product.totalInventory <= 0) {
				removeItem(item.id);
			}
		}
	});
});

cart_close_button.addEventListener('click', function () {
	cart_panel.classList.add('closed');
});

link_discord_button.addEventListener('click', async function () {
	await linkDiscord();
});

discord_not_you_button.addEventListener('click', async function () {
	localStorage.setItem('session_id', '');
	await linkDiscord();
});

generateCartItems();
generateUpsellItems();

// clear_cart_button.addEventListener('click', clearCart)
//totalAmount();
