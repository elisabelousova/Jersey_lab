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

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type DbProduct = {
  id: string;
  title: string;
  season: string;
  size: string;
  price: number;
  description: string;
  photos: string[];        // file_path[]
  status: string;
  created_at: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "available";
    const size = url.searchParams.get("size");

let query = supabase
  .from('products')
  .select('*')
  .eq('status', status)
  .gt('price', 0)
  .neq('title', '')
  .order('created_at', { ascending: false });

if (size) query = query.eq('size', size);

    const { data, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base = Deno.env.get("SUPABASE_URL") ?? "";
    const proxyBase = `${base}/functions/v1/telegram-file?path=`;

    const products = (data as DbProduct[]).map((p) => {
      const photos = Array.isArray(p.photos) ? p.photos.slice(0, 4) : [];
      const photo_urls = photos.map((path) => proxyBase + encodeURIComponent(path));
      return {
        ...p,
        photo_urls,
        cover_url: photo_urls[0] ?? null,
      };
    });

    return new Response(JSON.stringify({ ok: true, products }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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
