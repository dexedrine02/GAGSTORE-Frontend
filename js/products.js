const BACKEND_URL = "https://gagstore-backend.onrender.com"

async function getCollection(collectionId) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/shopify/getCollection/${encodeURIComponent(collectionId)}`);

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

async function getProduct(productHandle) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/shopify/getProduct/${encodeURIComponent(productHandle)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log(data.data.productByHandle);
    return data.data.productByHandle;
  } catch (error) {
    console.error('Error fetching product:', error);
    throw error;
  }
}

function importProductsFromCollection(collection, container) {
    collection.products.edges.forEach(edge => {
        getProduct(edge.node.handle).then(product => {
            const productTitle = product.title;
            const totalInventory = product.totalInventory; // product.variants.edges.reduce((total, variant) => total + variant.node.inventoryQuantity, 0);
            const productMinPrice = Number(product.priceRange.minVariantPrice.amount);
            const imageUrl = product.images.edges[0]?.node.url;

            const productElement = document.createElement('div');
            productElement.dataset.id = product.handle;
            productElement.innerHTML = `
                <div class="product_card">
                    <h1 class="product_stock">${totalInventory} Stock</h1>
                    <img src="${imageUrl}" alt="${productTitle}">
                    <h1 class="product_name">${productTitle}</h1>
                    <h1 class="product_price">$${productMinPrice.toFixed(2)}</h1>
                </div>
            `;
            
            if (totalInventory <= 5) {
                productElement.querySelector('.product_stock').classList.add('low_stock');
            }

            container.appendChild(productElement);

            productElement.querySelector('.product_card').addEventListener('click', async function() {
                if (!(product_add_panel.classList.contains('open'))) {
                    increment(productElement.dataset.id);
                    
                    let search = basket.find((x) => x.id === product.handle);
                    const productMinPrice = Number(product.priceRange.minVariantPrice.amount) * search.item;  
                  
                    product_add_panel.dataset.id = product.handle;
                    product_add_panel.classList.add('open');
                    product_add_panel.querySelector('.cart_item_title').innerHTML = productTitle;
                    product_add_panel.querySelector('.cart_item_price').innerHTML = `$${productMinPrice.toFixed(2)}`;
                    product_add_panel.querySelector('.cart_item_image').src = imageUrl;
                    product_add_panel.querySelector('.cart_item_amount').innerHTML = search.item;

                    cart_panel.classList.add('closed');
                }
            });
        });
    });
}

document.addEventListener("DOMContentLoaded", function() {
    getCollection("324227399870").then(collection => {
        importProductsFromCollection(collection, document.getElementById('products_container'));
    });
});

product_add_panel.querySelector('.close-button').addEventListener('click', function() {
    product_add_panel.classList.remove('open');
});

product_add_panel.querySelector('.increment_button').addEventListener('click', function() {
    const id = product_add_panel.dataset.id;
    increment(id);
    update(id);
});

product_add_panel.querySelector('.decrement_button').addEventListener('click', function() {
    const id = product_add_panel.dataset.id;
    decrement(id);
    update(id);
});