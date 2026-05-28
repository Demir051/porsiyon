const { fetchHtml } = require('../lib/http');
const bim = require('../lib/bim');

async function main() {
  const h = await fetchHtml(
    'https://www.bim.com.tr/Categories/100/aktuel-urunler.aspx?top=1&Bim_AktuelTarihKey=1572'
  );
  const products = bim.parseProductsFromHtml(h);
  console.log('parsed', products.length);
  if (products[0]) console.log(products[0]);

  const chunks = h.split(/<div class="product col-xl/);
  let failPrice = 0;
  let failTitle = 0;
  for (const chunk of chunks.slice(1, 6)) {
    const title = chunk.match(/class="title"[^>]*>([^<]+)/)?.[1]?.trim();
    const whole = chunk.match(/class="text quantify"[^>]*>([^<]+)/)?.[1];
    const frac = chunk.match(/class="number"[^>]*>([^<]+)/)?.[1];
    if (!title) failTitle++;
    const w = String(whole || '0').replace(/\./g, '').replace(',', '.');
    const price = Number(`${w}.${String(frac || '00').padStart(2, '0')}`);
    if (!Number.isFinite(price) || price <= 0) failPrice++;
    console.log({ title, whole, frac, price });
  }
}

main().catch(console.error);
