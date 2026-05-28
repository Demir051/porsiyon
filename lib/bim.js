const { fetchHtml } = require('./http');
const { pickBest } = require('./price-matcher');
const { parsePackageFromName } = require('./monthly-cost');

const CACHE_TTL_MS = 45 * 60 * 1000;
let productCache = { at: 0, products: [] };

function parseTurkishPrice(whole, frac) {
  const intPart = String(whole || '0').replace(/[^\d]/g, '') || '0';
  const fracPart = String(frac || '00').replace(/\D/g, '').padStart(2, '0').slice(0, 2);
  return Number(`${intPart}.${fracPart}`);
}

function parseProductsFromHtml(html) {
  const products = [];
  const chunks = html.split(/<div class="product col-xl/);

  for (const chunk of chunks.slice(1)) {
    const path = chunk.match(/href="(\/aktuel-urunler\/[^"]+)"/)?.[1];
    const brand = chunk.match(/class="subTitle"[^>]*>([^<]+)/)?.[1]?.trim();
    const title = chunk.match(/class="title"[^>]*>([^<]+)/)?.[1]?.trim();
    const gram = chunk.match(/class="gramajadet"[^>]*>([^<]+)/)?.[1]?.trim();
    const whole = chunk.match(/class="text quantify"[^>]*>([^<]+)/)?.[1];
    const frac = chunk.match(/class="number"[^>]*>([^<]+)/)?.[1];
    if (!title || whole == null) continue;

    const price = parseTurkishPrice(whole, frac);
    if (!Number.isFinite(price) || price <= 0) continue;

    const baseName = [brand, title].filter(Boolean).join(' ').trim();
    const name = gram ? `${baseName} ${gram.replace(/^•\s*/, '')}` : baseName;
    const parsed = parsePackageFromName(name);

    products.push({
      id: path || `${baseName}-${price}`,
      name,
      price,
      priceLabel: `${price.toFixed(2).replace('.', ',')} TL`,
      url: path ? `https://www.bim.com.tr${path}` : 'https://www.bim.com.tr/',
      image: null,
      store: 'bim',
      available: true,
      sellType: parsed?.grams || parsed?.ml ? 'piece' : 'piece',
      packageGrams: parsed?.grams,
      packageMl: parsed?.ml,
      packageCount: parsed?.count,
      packageLabel: parsed?.label || 'paket',
    });
  }

  return products;
}

function extractAktuelKeys(html) {
  const keys = [];
  for (const m of html.matchAll(/Bim_AktuelTarihKey=(\d+)/g)) {
    if (!keys.includes(m[1])) keys.push(m[1]);
  }
  return keys.slice(0, 8);
}

async function loadBimCatalog() {
  if (Date.now() - productCache.at < CACHE_TTL_MS && productCache.products.length) {
    return productCache.products;
  }

  const indexHtml = await fetchHtml('https://www.bim.com.tr/Categories/100/aktuel-urunler.aspx?top=1', {
    Referer: 'https://www.bim.com.tr/',
  });
  const keys = extractAktuelKeys(indexHtml);
  const pages = keys.length
    ? keys
    : ['1572'];

  const all = [];
  const seen = new Set();

  for (const key of pages) {
    try {
      const html = await fetchHtml(
        `https://www.bim.com.tr/Categories/100/aktuel-urunler.aspx?top=1&Bim_AktuelTarihKey=${key}`,
        { Referer: 'https://www.bim.com.tr/' }
      );
      for (const p of parseProductsFromHtml(html)) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        all.push(p);
      }
    } catch {
      /* skip failed campaign page */
    }
  }

  productCache = { at: Date.now(), products: all };
  return all;
}

async function searchBim(query) {
  const catalog = await loadBimCatalog();
  const q = (query || '').toLocaleLowerCase('tr-TR');
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return catalog.slice(0, 30);

  return catalog
    .filter((p) => {
      const name = p.name.toLocaleLowerCase('tr-TR');
      return words.every((w) => name.includes(w));
    })
    .slice(0, 40);
}

async function fetchBimPrice(query, options = {}) {
  const products = await searchBim(query);
  if (!products.length) {
    return { ok: false, error: 'BİM aktüel listesinde ürün bulunamadı', store: 'bim' };
  }
  const { product, score } = pickBest(query, products, options);
  return {
    ok: true,
    store: 'bim',
    matchScore: score,
    product,
    alternatives: products.slice(0, 5),
  };
}

module.exports = { searchBim, fetchBimPrice, parseProductsFromHtml };
