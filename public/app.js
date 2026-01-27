const ADMIN_USERNAME = 'elisabelousova';
const BOT_TOKEN = '8272563276:AAGJIXpXsCeUjkves0larvBXg9Jawe8K7t0';
const API_URL = 'https://zlgxnrgnpfnjyiugdacu.supabase.co/functions/v1/products-api';
const CHANNEL_URL = 'https://t.me/jersey_lab';

let allProducts = [];
let tg = null;

if (window.Telegram && window.Telegram.WebApp) {
  tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#ffffff');
    tg.setBottomBarColor('#ffffff');
  } catch (e) {}
}

function openChannel() {
  if (tg) tg.openTelegramLink(CHANNEL_URL);
  else window.open(CHANNEL_URL, '_blank');
}

document.getElementById('openChannelTop')?.addEventListener('click', openChannel);
document.getElementById('openChannelEmpty')?.addEventListener('click', openChannel);

async function loadProducts() {
  const loading = document.getElementById('loading');
  const productsContainer = document.getElementById('products');
  const emptyState = document.getElementById('empty');

  try {
    const response = await fetch(`${API_URL}?status=available`, { cache: 'no-store' });
    const data = await response.json();

    if (data.ok && Array.isArray(data.products)) {
      allProducts = data.products;
      renderProducts(allProducts);
    } else {
      throw new Error('Bad API response');
    }
  } catch (error) {
    console.error('Error loading products:', error);
    productsContainer.innerHTML =
      '<p style="text-align:center;color:#ff6666;font-weight:700;">Ошибка загрузки товаров</p>';
    emptyState.style.display = 'none';
  } finally {
    loading.style.display = 'none';
  }
}

function renderProducts(products) {
  const productsContainer = document.getElementById('products');
  const emptyState = document.getElementById('empty');
  const count = document.getElementById('count');

  if (products.length === 0) {
    productsContainer.innerHTML = '';
    emptyState.style.display = 'block';
    if (count) count.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';

  if (count) {
    count.style.display = 'block';
    count.textContent = `Найдено: ${products.length}`;
  }

  productsContainer.innerHTML = products.map(createProductCard).join('');

  document.querySelectorAll('.buy-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const productId = e.currentTarget.dataset.productId;
      const product = products.find(p => String(p.id) === String(productId));
      if (product) handleBuy(product);

  document.querySelectorAll('.carousel .slides').forEach(slides => {
  slides.addEventListener('scroll', () => {
    const carousel = slides.parentElement;
    const dots = carousel.querySelectorAll('.dot');
    if (!dots.length) return;

    const idx = Math.round(slides.scrollLeft / slides.clientWidth);
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  });
});
}

/**
 * ВАЖНО:
 * Фронт НЕ должен собирать фото через api.telegram.org/file/bot<TOKEN>...
 * Пусть products-api возвращает готовый URL картинки:
 * - product.cover_url (или product.photo_url)
 * Иначе показываем плейсхолдер.
 */
function createProductCard(product) {
  const photos = Array.isArray(product.photos) ? product.photos.slice(0, 4) : [];

  const photoUrls = photos.length
    ? photos.map(p => `https://api.telegram.org/file/bot${BOT_TOKEN}/${p}`)
    : ['https://via.placeholder.com/400x400?text=No+Image'];

  const slidesHtml = photoUrls.map((url, idx) => `
    <div class="slide">
      <img src="${url}" alt="${product.title}" loading="lazy"
           onerror="this.src='https://via.placeholder.com/400x400?text=No+Image'">
    </div>
  `).join('');

  const dotsHtml = photoUrls.length > 1
    ? `<div class="dots">${photoUrls.map((_, i) => `<span class="dot ${i===0?'active':''}"></span>`).join('')}</div>`
    : '';

  return `
    <div class="product-card">
      <div class="carousel" data-product-id="${product.id}">
        <div class="slides">
          ${slidesHtml}
        </div>
        ${dotsHtml}
      </div>

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
  const message =
    `Здравствуйте! Хочу купить:\n\n` +
    `${product.title || ''}\n` +
    `Размер: ${product.size || ''}\n` +
    `Цена: ${product.price || ''}₽`;

  const url = `https://t.me/${ADMIN_USERNAME}?text=${encodeURIComponent(message)}`;

  if (tg) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}

document.getElementById('sizeFilter')?.addEventListener('change', (e) => {
  const selectedSize = e.target.value;

  if (!selectedSize) {
    renderProducts(allProducts);
    return;
  }

  const filtered = allProducts.filter(p => p.size === selectedSize);
  renderProducts(filtered);
});

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

loadProducts();
