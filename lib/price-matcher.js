function normalize(text) {
  return (text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreProduct(query, productName) {
  const q = normalize(query);
  const name = normalize(productName);
  if (!q || !name) return 0;
  if (name === q) return 100;
  if (name.startsWith(q + ' ')) return 90;
  if (name.includes(' ' + q + ' ')) return 80;
  if (name.startsWith(q)) return 75;
  if (name.includes(q)) return 60;

  const qWords = q.split(' ').filter(Boolean);
  const matched = qWords.filter((w) => name.includes(w)).length;
  return (matched / qWords.length) * 50;
}

function pickBest(query, products, options = {}) {
  if (!products.length) return null;
  const monthlyUnit = options.monthlyUnit;

  function score(p) {
    let s = scoreProduct(query, p.name);
    if (monthlyUnit === 'kg') {
      if (p.sellType === 'weight' || p.pricePerKg) s += 25;
      if (/\bkg\b/i.test(p.name) && !/\d+\s*g\b/i.test(p.name)) s += 15;
    }
    if (monthlyUnit === 'adet' && p.packageCount) s += 10;
    return s;
  }

  let best = products[0];
  let bestScore = score(best);
  for (let i = 1; i < products.length; i++) {
    const s = score(products[i]);
    if (s > bestScore) {
      best = products[i];
      bestScore = s;
    }
  }
  return { product: best, score: bestScore };
}

module.exports = { normalize, scoreProduct, pickBest };
