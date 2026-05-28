const { fetchJson } = require('./http');
const { pickBest } = require('./price-matcher');

function formatMigrosPrice(product) {
  const kurus = product.shownPrice ?? product.regularPrice;
  const tl = kurus / 100;
  let label = `${tl.toFixed(2).replace('.', ',')} TL`;

  if (product.unit === 'GRAM' && product.unitAmount) {
    const kg = product.unitAmount / 1000;
    if (kg === 1) label += ' / kg';
    else label += ` / ${product.unitAmount} g`;
  } else if (product.unitPrice) {
    label += ` (${product.unitPrice})`;
  }

  return { amount: tl, label, unit: product.unit, unitAmount: product.unitAmount };
}

function mapMigrosProduct(p) {
  const price = formatMigrosPrice(p);
  const image = p.images?.[0]?.urls?.PRODUCT_LIST || null;
  const base = {
    id: String(p.id),
    name: p.name,
    price: price.amount,
    priceLabel: price.label,
    url: `https://www.migros.com.tr/${p.prettyName}`,
    image,
    store: 'migros',
  };

  if (p.unit === 'GRAM' && p.unitAmount) {
    const kg = p.unitAmount / 1000;
    return {
      ...base,
      sellType: 'weight',
      pricePerKg: price.amount / kg,
      packageLabel: kg === 1 ? 'kg' : `${p.unitAmount} g`,
    };
  }

  return base;
}

async function searchMigros(query) {
  const encoded = encodeURIComponent(query.trim());
  const url = `https://www.migros.com.tr/rest/search/screens/products?q=${encoded}&page=1`;
  const json = await fetchJson(url, { Referer: 'https://www.migros.com.tr/' });
  const items = json?.data?.searchInfo?.storeProductInfos || [];
  return items.map(mapMigrosProduct);
}

async function fetchMigrosPrice(query, options = {}) {
  const products = await searchMigros(query);
  if (!products.length) {
    return { ok: false, error: 'Migros\'ta ürün bulunamadı', store: 'migros' };
  }
  const { product, score } = pickBest(query, products, options);
  return {
    ok: true,
    store: 'migros',
    matchScore: score,
    product,
    alternatives: products.slice(0, 5),
  };
}

module.exports = { searchMigros, fetchMigrosPrice };
