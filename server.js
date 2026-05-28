const express = require('express');
const path = require('path');
const { fetchA101Price, searchA101 } = require('./lib/a101');
const { searchBim } = require('./lib/bim');
const storage = require('./lib/storage');
const { computeMonthlyCost } = require('./lib/monthly-cost');
const { computePlan, defaultConfig } = require('./lib/plan-engine');
const presetsData = require('./data/presets.json');

const PRESET_ALIASES = { 'sporcu-demir': 'hazir-ogun-planim' };

function findPreset(id) {
  const resolved = PRESET_ALIASES[id] || id;
  return presetsData.presets.find((p) => p.id === resolved);
}

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function guncelleMagaza(malzeme, store) {
  if (store !== 'a101') {
    return { store, ok: false, error: 'Yalnızca A101 destekleniyor' };
  }
  const query = malzeme.ad;
  const result = await fetchA101Price(query);

  if (!result.ok) {
    return { store, ok: false, error: result.error };
  }

  const p = result.product;
  storage.saveFiyat(malzeme.id, store, {
    urunAdi: p.name,
    fiyat: p.price,
    fiyatLabel: p.priceLabel,
    url: p.url,
    resim: p.image,
    eslesmeSkoru: result.matchScore,
  });

  return { store, ok: true, product: p };
}

async function fetchBestPrice(query, options = {}) {
  const a101 = await fetchA101Price(query, options).catch(() => ({ ok: false }));
  if (!a101.ok) {
    return { ok: false, error: 'A101\'de ürün bulunamadı' };
  }
  return {
    ok: true,
    source: a101.store,
    product: a101.product,
    matchScore: a101.matchScore,
  };
}

app.get('/api/malzemeler', (req, res) => {
  res.json({ malzemeler: storage.listMalzemeler() });
});

app.post('/api/malzemeler', (req, res) => {
  const { ad, birim, miktar } = req.body || {};
  if (!ad?.trim()) {
    return res.status(400).json({ error: 'Malzeme adı gerekli' });
  }
  const item = storage.addMalzeme({ ad, birim, miktar });
  res.status(201).json(item);
});

app.put('/api/malzemeler/:id', (req, res) => {
  const updated = storage.updateMalzeme(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Malzeme bulunamadı' });
  res.json(updated);
});

app.delete('/api/malzemeler/:id', (req, res) => {
  if (!storage.deleteMalzeme(req.params.id)) {
    return res.status(404).json({ error: 'Malzeme bulunamadı' });
  }
  res.json({ ok: true });
});

function priceResponse(product, source, monthlyQty, monthlyUnit) {
  const body = {
    ok: true,
    price: product.price,
    source,
    url: product.url,
    product: product.name,
    priceLabel: product.priceLabel,
  };

  if (monthlyQty != null && monthlyUnit) {
    const monthly = computeMonthlyCost(monthlyQty, monthlyUnit, product);
    body.monthly = {
      qty: monthlyQty,
      unit: monthlyUnit,
      packagesNeeded: monthly.packagesNeeded,
      total: monthly.total,
      unitText: monthly.unitText,
      monthlyText: monthly.monthlyText,
      note: monthly.note,
    };
  }

  return body;
}

app.get('/api/price', async (req, res) => {
  const query = String(req.query.query || req.query.q || '').trim();
  if (!query) return res.status(400).json({ ok: false, error: 'Arama terimi gerekli' });

  const monthlyQty = req.query.monthlyQty != null ? Number(req.query.monthlyQty) : null;
  const monthlyUnit = req.query.monthlyUnit ? String(req.query.monthlyUnit) : null;

  try {
    const pickOpts = monthlyUnit ? { monthlyUnit } : {};
    const best = await fetchBestPrice(query, pickOpts);
    if (!best.ok) {
      return res.json({ ok: false, error: best.error || 'Ürün bulunamadı' });
    }
    res.json(priceResponse(best.product, best.source, monthlyQty, monthlyUnit));
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message || 'Fiyat alınamadı' });
  }
});

app.get('/api/ara', async (req, res) => {
  const q = (req.query.q || '').trim();
  const magaza = req.query.magaza || 'hepsi';
  if (!q) return res.status(400).json({ error: 'Arama terimi gerekli' });

  try {
    const sonuc = {};
    if (magaza === 'a101' || magaza === 'hepsi') {
      sonuc.a101 = await searchA101(q);
    }
    if (magaza === 'bim' || magaza === 'hepsi') {
      sonuc.bim = await searchBim(q);
    }
    res.json(sonuc);
  } catch (err) {
    res.status(502).json({ error: err.message || 'Arama başarısız' });
  }
});

app.post('/api/malzemeler/:id/guncelle', async (req, res) => {
  const malzemeler = storage.listMalzemeler();
  const malzeme = malzemeler.find((m) => m.id === req.params.id);
  if (!malzeme) return res.status(404).json({ error: 'Malzeme bulunamadı' });

  const magazalar = req.body?.magazalar || ['a101'];
  const sonuclar = [];

  try {
    for (const store of magazalar) {
      if (store === 'a101' || store === 'bim') {
        sonuclar.push(await guncelleMagaza(malzeme, store));
      }
    }
    const guncel = storage.listMalzemeler().find((m) => m.id === malzeme.id);
    res.json({ malzeme: guncel, sonuclar });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Fiyat güncellenemedi' });
  }
});

app.get('/api/plan/presets', (_req, res) => {
  res.json({
    presets: presetsData.presets.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
    })),
  });
});

app.get('/api/plan/presets/:id', (req, res) => {
  const preset = findPreset(req.params.id);
  if (!preset) return res.status(404).json({ error: 'Plan bulunamadı' });
  res.json(preset);
});

app.post('/api/plan/compute', (req, res) => {
  const config = { ...defaultConfig(), ...(req.body?.config || {}) };
  const preset = findPreset(config.presetId || defaultConfig().presetId);
  if (!preset) return res.status(404).json({ error: 'Plan bulunamadı' });
  res.json(computePlan(config, preset));
});

app.post('/api/plan/sync-malzemeler', async (req, res) => {
  const config = { ...defaultConfig(), ...(req.body?.config || {}) };
  const preset = findPreset(config.presetId || defaultConfig().presetId);
  if (!preset) return res.status(404).json({ error: 'Plan bulunamadı' });

  const plan = computePlan(config, preset);
  const eklenen = [];

  for (const item of plan.items) {
    const birim =
      item.monthlyUnit === 'kg' ? 'kg' : item.monthlyUnit === 'lt' ? 'lt' : item.monthlyUnit;
    const malzeme = storage.addMalzeme({
      ad: item.name,
      birim,
      miktar: item.monthlyQty,
    });
    eklenen.push(malzeme);
  }

  res.json({ ok: true, count: eklenen.length, malzemeler: storage.listMalzemeler() });
});

app.post('/api/malzemeler/guncelle', async (req, res) => {
  const malzemeler = storage.listMalzemeler();
  const magazalar = req.body?.magazalar || ['a101'];
  const rapor = [];

  for (const malzeme of malzemeler) {
    const satir = { id: malzeme.id, ad: malzeme.ad, sonuclar: [] };
    for (const store of magazalar) {
      try {
        satir.sonuclar.push(await guncelleMagaza(malzeme, store));
        await new Promise((r) => setTimeout(r, 350));
      } catch (err) {
        satir.sonuclar.push({ store, ok: false, error: err.message });
      }
    }
    rapor.push(satir);
  }

  res.json({ rapor, malzemeler: storage.listMalzemeler() });
});

app.listen(PORT, () => {
  console.log(`Porsiyon: http://localhost:${PORT}`);
});
