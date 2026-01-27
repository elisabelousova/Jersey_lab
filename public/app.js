const ADMIN_USERNAME = 'elisabelousova';
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

function afterRenderAttachHandlers(products) {
  // buy buttons
  document.querySelectorAll('.buy-button').forEach((button) => {
    button.addEventListener('click', (e) => {
      const productId = e.currentTarget.dataset.productId;
      const product = products.find((p) => String(p.id) === String(productId));
      if (product) handleBuy(product);
    });
  });

  // dots (carousel)
  document.querySelectorAll('.carousel .slides').forEach((slides) => {
    slides.addEventListener('scroll', () => {
      const carousel = slides.parentElement;
      const dots = carousel.querySelectorAll('.dot');
      if (!dots.length) return;

      const idx = Math.round(slides.scrollLeft / slides.clientWidth);
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    });
  });
}

function renderProducts(products) {
  const productsContainer = document.getElementById('products');
  const emptyState = document.getElementById('empty');
  const count = document.getElementById('count');

  if (!products.length) {
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
  afterRenderAttachHandlers(products);
}

function createProductCard(product) {
  const urls = Array.isArray(product.photo_urls) ? product.photo_urls.slice(0, 4) : [];
  const photoUrls = urls.length
    ? urls
    : ['https://via.placeholder.com/600x600?text=No+Image'];

  const slidesHtml = photoUrls.map((url) => `
    <div class="slide">
      <img src="${escapeAttr(url)}" alt="${escapeAttr(product.title || 'Jersey')}" loading="lazy"
           onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'">
    </div>
  `).join('');

  const dotsHtml = photoUrls.length > 1
    ? `<div class="dots">${photoUrls.map((_, i) => `<span class="dot ${i===0?'active':''}"></span>`).join('')}</div>`
    : '';

  return `
    <div class="product-card">
      <div class="carousel" data-product-id="${escapeAttr(product.id)}">
        <div class="slides">
          ${slidesHtml}
        </div>
        ${dotsHtml}
      </div>

      <div class="product-info">
        <h3 class="product-title">${escapeHtml(product.title || '')}</h3>
        <div class="product-meta">
          <span class="product-size">📏 ${escapeHtml(product.size || '')}</span>
          ${product.season ? `<span class="product-season">📅 ${escapeHtml(product.season)}</span>` : ''}
        </div>
        ${product.description ? `<p class="product-description">${escapeHtml(product.description)}</p>` : ''}
        <div class="product-footer">
          <span class="product-price">${escapeHtml(product.price || 0)}₽</span>
          <button class="buy-button" data-product-id="${escapeAttr(product.id)}">Купить</button>
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
  if (!selectedSize) return renderProducts(allProducts);

  const filtered = allProducts.filter((p) => p.size === selectedSize);
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

// для атрибутов (src/id)
function escapeAttr(str) {
  return String(str).replaceAll('"', '&quot;');
}

loadProducts();
