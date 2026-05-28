const { fetchJson } = require('./http');
const { pickBest } = require('./price-matcher');
const { parsePackageFromName } = require('./monthly-cost');

function productImage(item) {
  const img = (item.image || []).find((i) => i.imageType === 'product');
  return img?.url || null;
}

function mapA101Product(p) {
  const price = Number(p.price);
  const parsed = parsePackageFromName(p.title);
  const soldByWeight =
    p.salesUnitOfMeasure === 'KG' && p.baseUnitOfMeasure === 'KG' && !parsed?.grams;

  if (soldByWeight) {
    return {
      id: String(p.id),
      name: p.title,
      price,
      priceLabel: `${price.toFixed(2).replace('.', ',')} TL / kg`,
      url: p.seoUrl || p.link || `https://www.a101.com.tr/arama?search_text=${encodeURIComponent(p.title)}`,
      image: productImage(p),
      store: 'a101',
      available: p.available !== false,
      sellType: 'weight',
      pricePerKg: price,
      packageLabel: 'kg',
    };
  }

  const packLabel = parsed?.label || (p.salesUnitOfMeasure === 'KG' ? 'kg' : 'paket');
  return {
    id: String(p.id),
    name: p.title,
    price,
    priceLabel: `${price.toFixed(2).replace('.', ',')} TL / ${packLabel}`,
    url: p.seoUrl || p.link || `https://www.a101.com.tr/arama?search_text=${encodeURIComponent(p.title)}`,
    image: productImage(p),
    store: 'a101',
    available: p.available !== false,
    sellType: 'piece',
    packageGrams: parsed?.grams,
    packageMl: parsed?.ml,
    packageCount: parsed?.count,
    packageLabel: packLabel,
  };
}

async function searchA101Kapida(query) {
  const encoded = encodeURIComponent(query.trim());
  const url = `https://a101.wawlabs.com/search?q=${encoded}`;
  const json = await fetchJson(url, { Referer: 'https://www.a101.com.tr/' });
  return (json.res || []).map(mapA101Product);
}

async function searchA101Ekstra(query) {
  const encoded = encodeURIComponent(query.trim());
  const url = `https://a101-ecom.wawlabs.com/search?q=${encoded}`;
  const json = await fetchJson(url, { Referer: 'https://www.a101.com.tr/' });
  return (json.res || []).map((p) => ({
    id: String(p.id),
    name: p.name || p.title,
    price: Number(p.price ?? p.attributes?.price ?? 0),
    priceLabel: p.priceStr || `${Number(p.price).toFixed(2).replace('.', ',')} TL`,
    url: p.link || `https://www.a101.com.tr/arama?search_text=${encoded}`,
    image: p.image?.[0]?.url || p.images?.[0] || null,
    store: 'a101-ekstra',
    available: true,
  }));
}

async function searchA101(query) {
  const [kapida, ekstra] = await Promise.all([
    searchA101Kapida(query).catch(() => []),
    searchA101Ekstra(query).catch(() => []),
  ]);
  const merged = [...kapida, ...ekstra.filter((e) => !kapida.some((k) => k.id === e.id))];
  return merged;
}

async function fetchA101Price(query, options = {}) {
  const products = await searchA101(query);
  if (!products.length) {
    return { ok: false, error: 'A101\'de ürün bulunamadı', store: 'a101' };
  }
  const { product, score } = pickBest(query, products, options);
  return {
    ok: true,
    store: 'a101',
    matchScore: score,
    product,
    alternatives: products.slice(0, 5),
  };
}

module.exports = { searchA101, fetchA101Price };
