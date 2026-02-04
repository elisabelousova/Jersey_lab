const ADMIN_USERNAME = 'elisabelousova';
const API_URL = 'https://zlgxnrgnpfnjyiugdacu.supabase.co/functions/v1/products-api';
const CHANNEL_URL = 'https://t.me/jersey_lab';

let allProducts = [];
let tg = null;

// Telegram WebApp init
if (window.Telegram && window.Telegram.WebApp) {
  tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();
  try {
    // у тебя тёмный фон — НЕ задаём белые цвета
    // tg.setHeaderColor('#ffffff');
    // tg.setBottomBarColor('#ffffff');
  } catch (e) {}
}

function openChannel() {
  if (tg) tg.openTelegramLink(CHANNEL_URL);
  else window.open(CHANNEL_URL, '_blank');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(str) {
  return String(str ?? '').replaceAll('"', '&quot;');
}

function normalizeSizeForUi(s) {
  const t = String(s || '').trim().toUpperCase();
  if (t === '2XL') return 'XXL';
  if (t === '3XL') return 'XXXL';
  if (t === '4XL') return 'XXXXL';
  if (t === '5XL') return 'XXXXXL';
  return t;
}

function populateSizeFilter(products) {
  const sel = document.getElementById('sizeFilter');
  if (!sel) return;

  const set = new Set();

  for (const p of products || []) {
    if (Array.isArray(p.sizes) && p.sizes.length) {
      p.sizes.forEach((s) => set.add(normalizeSizeForUi(s)));
      continue;
    }

    if (p.size) {
      String(p.size)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((s) => set.add(normalizeSizeForUi(s)));
    }
  }

  const order = ['XS','S','M','L','XL','XXL','XXXL','XXXXL','XXXXXL'];
  const sizes = Array.from(set).sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const current = sel.value || '';

  sel.innerHTML =
    `<option value="">Все размеры</option>` +
    sizes.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');

  sel.value = sizes.includes(current) ? current : '';
}

async function loadProducts() {
  const loading = document.getElementById('loading');
  const productsContainer = document.getElementById('products');
  const emptyState = document.getElementById('empty');

  try {
    const response = await fetch(`${API_URL}?status=available`, { cache: 'no-store' });
    const data = await response.json();

    if (data.ok && Array.isArray(data.products)) {
      allProducts = data.products;
      populateSizeFilter(allProducts);
      renderProducts(allProducts);
    } else {
      console.log('API response:', data);
      throw new Error('Bad API response');
    }
  } catch (error) {
    console.error('Error loading products:', error);
    if (productsContainer) productsContainer.innerHTML = '<p class="error-text">Ошибка загрузки товаров</p>';
    if (emptyState) emptyState.style.display = 'none';
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

// ---------- Description (2 lines + inline "Подробнее") ----------

function sanitizeDesc(raw) {
  // ✅ стираем переносы строк и лишние пробелы
  return String(raw || '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildDescriptionHtml(product) {
  const desc = sanitizeDesc(product?.description);
  if (!desc) return '';

  // порог: показывать "Подробнее" только если реально длинно
  const showMore = desc.length > 90;

  if (!showMore) {
    return `<p class="product-description">${escapeHtml(desc)}</p>`;
  }

  // ✅ "Подробнее" внутри того же <p>, чтобы было “текст… Подробнее”
  return `
    <p class="product-description product-description--clamped">
      <span class="desc-text">${escapeHtml(desc)}</span>
      <span class="more-inline" role="button" tabindex="0">Подробнее</span>
    </p>
  `;
}

function createProductCard(product) {
  const urls = Array.isArray(product.photo_urls) ? product.photo_urls.slice(0, 8) : [];
  const photoUrls = urls.length ? urls : ['https://via.placeholder.com/800x800?text=No+Image'];

  const slidesHtml = photoUrls.map((url, idx) => `
    <div class="slide">
      <img
        src="${escapeAttr(url)}"
        alt="${escapeHtml(product.title || '')}"
        loading="lazy"
        class="product-photo"
        data-product-id="${escapeAttr(product.id)}"
        data-photo-idx="${idx}"
        onerror="this.src='https://via.placeholder.com/800x800?text=No+Image'"
      >
    </div>
  `).join('');

  const dotsHtml = photoUrls.length > 1
    ? `<div class="dots">${photoUrls.map((_, i) => `<span class="dot ${i === 0 ? 'active' : ''}"></span>`).join('')}</div>`
    : '';

  const arrowsHtml = photoUrls.length > 1 ? `
    <button class="car-arrow car-prev" type="button" aria-label="Предыдущее фото">‹</button>
    <button class="car-arrow car-next" type="button" aria-label="Следующее фото">›</button>
  ` : '';

  const sizeText = Array.isArray(product.sizes) && product.sizes.length
    ? product.sizes.map(normalizeSizeForUi).join(', ')
    : (product.size || '');

  return `
    <div class="product-card" data-product-id="${escapeAttr(product.id)}">
      <div class="carousel" data-product-id="${escapeAttr(product.id)}">
        <div class="slides">
          ${slidesHtml}
        </div>
        ${dotsHtml}
        ${arrowsHtml}
      </div>

      <div class="product-info">
        <h3 class="product-title">${escapeHtml(product.title || '')}</h3>

        <div class="product-meta">
          <span class="product-size">📏 ${escapeHtml(sizeText)}</span>
          ${product.season ? `<span class="product-season">📅 ${escapeHtml(product.season)}</span>` : ''}
        </div>

        ${buildDescriptionHtml(product)}

        <div class="product-footer">
          <span class="product-price">${escapeHtml(product.price || 0)}₽</span>
          <button class="buy-button" data-product-id="${escapeAttr(product.id)}">Купить</button>
        </div>
      </div>
    </div>
  `;
}

function renderProducts(products) {
  const productsContainer = document.getElementById('products');
  const emptyState = document.getElementById('empty');
  const count = document.getElementById('count');

  if (!products || !products.length) {
    if (productsContainer) productsContainer.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    if (count) count.style.display = 'none';

    const btn = document.getElementById('openChannelEmpty');
    if (btn) btn.onclick = openChannel;

    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  if (count) {
    count.style.display = 'block';
    count.textContent = `Найдено: ${products.length}`;
  }

  if (productsContainer) productsContainer.innerHTML = products.map(createProductCard).join('');
  afterRenderAttachHandlers(products);
}

function handleBuy(product) {
  const sizeText =
    (Array.isArray(product.sizes) && product.sizes.length)
      ? product.sizes.map(normalizeSizeForUi).join(', ')
      : normalizeSizeForUi(product.size || '');

  const message =
    `Здравствуйте! Хочу купить:\n\n` +
    `${product.title || ''}\n` +
    `Размер: ${sizeText}\n` +
    `Цена: ${product.price || ''}₽`;

  const url = `https://t.me/${ADMIN_USERNAME}?text=${encodeURIComponent(message)}`;
  if (tg) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}

function scrollCarouselToIndex(slidesEl, idx) {
  const w = slidesEl.clientWidth;
  slidesEl.scrollTo({ left: idx * w, behavior: 'smooth' });
}

function getCarouselIndex(slidesEl) {
  const w = slidesEl.clientWidth || 1;
  return Math.round(slidesEl.scrollLeft / w);
}

function setDotsActive(carouselEl, idx) {
  const dots = carouselEl.querySelectorAll('.dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === idx));
}

function afterRenderAttachHandlers(products) {
  // Buy
  document.querySelectorAll('.buy-button').forEach((button) => {
    button.addEventListener('click', (e) => {
      const productId = e.currentTarget.dataset.productId;
      const product = products.find((p) => String(p.id) === String(productId));
      if (product) handleBuy(product);
    });
  });

  // Carousel
  document.querySelectorAll('.carousel').forEach((carouselEl) => {
    const slidesEl = carouselEl.querySelector('.slides');
    if (!slidesEl) return;

    slidesEl.addEventListener('scroll', () => {
      const idx = getCarouselIndex(slidesEl);
      setDotsActive(carouselEl, idx);
    }, { passive: true });

    const prevBtn = carouselEl.querySelector('.car-prev');
    const nextBtn = carouselEl.querySelector('.car-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = getCarouselIndex(slidesEl);
        const dots = carouselEl.querySelectorAll('.dot');
        const total = dots.length || 1;
        const nextIdx = (idx - 1 + total) % total;
        scrollCarouselToIndex(slidesEl, nextIdx);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = getCarouselIndex(slidesEl);
        const dots = carouselEl.querySelectorAll('.dot');
        const total = dots.length || 1;
        const nextIdx = (idx + 1) % total;
        scrollCarouselToIndex(slidesEl, nextIdx);
      });
    }
  });

  // Lightbox
  document.querySelectorAll('.product-photo').forEach((imgEl) => {
    imgEl.addEventListener('click', (e) => {
      e.preventDefault();
      const productId = imgEl.dataset.productId;
      const startIdx = Number(imgEl.dataset.photoIdx || 0);

      const product = products.find((p) => String(p.id) === String(productId));
      const urls = Array.isArray(product?.photo_urls) ? product.photo_urls.slice(0, 8) : [];
      if (urls.length) openLightbox(urls, startIdx);
    });
  });

  // Inline "Подробнее" => expand (без кнопок, без переноса)
  document.querySelectorAll('.product-card').forEach((card) => {
    const more = card.querySelector('.more-inline');
    if (!more) return;

    const activate = () => {
      card.classList.add('expanded');
      more.style.display = 'none';
      const p = card.querySelector('.product-description');
      p?.classList.remove('product-description--clamped');
    };

    more.addEventListener('click', (e) => { e.preventDefault(); activate(); });
    more.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });
}

// Filter
document.getElementById('sizeFilter')?.addEventListener('change', (e) => {
  const selectedSize = normalizeSizeForUi(e.target.value);
  if (!selectedSize) return renderProducts(allProducts);

  renderProducts(allProducts.filter((p) => {
    const arr = Array.isArray(p.sizes) ? p.sizes.map(normalizeSizeForUi) : [];
    if (arr.length) return arr.includes(selectedSize);

    return String(p.size || '')
      .split(',')
      .map(x => normalizeSizeForUi(x))
      .includes(selectedSize);
  }));
});

// ===== Lightbox =====
let lbOpen = false;
let lbUrls = [];
let lbIdx = 0;

function $(id) { return document.getElementById(id); }

const lb = $('lightbox');
const lbImg = $('lbImg');
const lbClose = $('lbClose');
const lbPrev = $('lbPrev');
const lbNext = $('lbNext');
const lbCounter = $('lbCounter');

function openLightbox(urls, startIdx = 0) {
  lbUrls = Array.isArray(urls) ? urls : [];
  lbIdx = Math.max(0, Math.min(startIdx, lbUrls.length - 1));
  if (!lbUrls.length || !lb || !lbImg) return;

  lbOpen = true;
  lb.style.display = 'flex';
  renderLightbox();
}

function closeLightbox() {
  lbOpen = false;
  if (lb) lb.style.display = 'none';
}

function renderLightbox() {
  if (!lbImg) return;
  lbImg.src = lbUrls[lbIdx];
  if (lbCounter) lbCounter.textContent = `${lbIdx + 1} / ${lbUrls.length}`;

  const multi = lbUrls.length > 1;
  if (lbPrev) lbPrev.style.visibility = multi ? 'visible' : 'hidden';
  if (lbNext) lbNext.style.visibility = multi ? 'visible' : 'hidden';
}

function prevLb() {
  if (!lbUrls.length) return;
  lbIdx = (lbIdx - 1 + lbUrls.length) % lbUrls.length;
  renderLightbox();
}

function nextLb() {
  if (!lbUrls.length) return;
  lbIdx = (lbIdx + 1) % lbUrls.length;
  renderLightbox();
}

lbClose?.addEventListener('click', (e) => { e.preventDefault(); closeLightbox(); });
lbPrev?.addEventListener('click', (e) => { e.preventDefault(); prevLb(); });
lbNext?.addEventListener('click', (e) => { e.preventDefault(); nextLb(); });

lb?.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });

document.addEventListener('keydown', (e) => {
  if (!lbOpen) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') prevLb();
  if (e.key === 'ArrowRight') nextLb();
});

let touchStartX = 0;
lb?.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0]?.clientX || 0;
}, { passive: true });

lb?.addEventListener('touchend', (e) => {
  const endX = e.changedTouches[0]?.clientX || 0;
  const dx = endX - touchStartX;
  if (Math.abs(dx) < 40) return;
  if (dx > 0) prevLb(); else nextLb();
}, { passive: true });

// Start
document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
});
