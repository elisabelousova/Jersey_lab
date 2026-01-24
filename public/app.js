const ADMIN_USERNAME = 'jersey_lab_admin';
const BOT_TOKEN = '8272563276:AAGJIXpXsCeUjkves0larvBXg9Jawe8K7t0';
const API_URL = 'https://zlgxnrgnpfnjyiugdacu.supabase.co/functions/v1/products-api';

let allProducts = [];
let tg = null;

if (window.Telegram && window.Telegram.WebApp) {
  tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();
}

async function loadProducts() {
  const loading = document.getElementById('loading');
  const productsContainer = document.getElementById('products');
  const emptyState = document.getElementById('empty');

  try {
    const response = await fetch(`${API_URL}?status=available`);
    const data = await response.json();

    if (data.ok && data.products) {
      allProducts = data.products;
      renderProducts(allProducts);
    } else {
      throw new Error('Failed to load products');
    }
  } catch (error) {
    console.error('Error loading products:', error);
    productsContainer.innerHTML = '<p style="text-align: center; color: #ff4444;">Ошибка загрузки товаров</p>';
  } finally {
    loading.style.display = 'none';
  }
}

function renderProducts(products) {
  const productsContainer = document.getElementById('products');
  const emptyState = document.getElementById('empty');

  if (products.length === 0) {
    productsContainer.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  productsContainer.innerHTML = products.map(product => createProductCard(product)).join('');

  document.querySelectorAll('.buy-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const productId = e.target.dataset.productId;
      const product = products.find(p => p.id === productId);
      if (product) {
        handleBuy(product);
      }
    });
  });
}

function createProductCard(product) {
  const photoUrl = product.photos && product.photos.length > 0
    ? `https://api.telegram.org/file/bot${BOT_TOKEN}/${product.photos[0]}`
    : 'https://via.placeholder.com/400x400?text=No+Image';

  return `
    <div class="product-card">
      <img src="${photoUrl}" alt="${product.title}" class="product-image" onerror="this.src='https://via.placeholder.com/400x400?text=No+Image'">
      <div class="product-info">
        <h3 class="product-title">${product.title}</h3>
        <div class="product-meta">
          <span class="product-size">📏 ${product.size}</span>
          ${product.season ? `<span class="product-season">📅 ${product.season}</span>` : ''}
        </div>
        ${product.description ? `<p class="product-description">${product.description}</p>` : ''}
        <div class="product-footer">
          <span class="product-price">${product.price}₽</span>
          <button class="buy-button" data-product-id="${product.id}">Купить</button>
        </div>
      </div>
    </div>
  `;
}

function handleBuy(product) {
  const message = `Здравствуйте! Хочу купить:\n\n${product.title}\nРазмер: ${product.size}\nЦена: ${product.price}₽`;
  const url = `https://t.me/${ADMIN_USERNAME}?text=${encodeURIComponent(message)}`;

  if (tg) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}

document.getElementById('sizeFilter').addEventListener('change', (e) => {
  const selectedSize = e.target.value;

  if (selectedSize === '') {
    renderProducts(allProducts);
  } else {
    const filtered = allProducts.filter(p => p.size === selectedSize);
    renderProducts(filtered);
  }
});

loadProducts();
