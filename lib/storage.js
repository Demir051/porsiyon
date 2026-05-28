const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'malzemeler.json');

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ malzemeler: [] }, null, 2), 'utf8');
  }
}

function readData() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function listMalzemeler() {
  return readData().malzemeler;
}

function addMalzeme({ ad, birim, miktar }) {
  const data = readData();
  const item = {
    id: `m_${Date.now()}`,
    ad: ad.trim(),
    birim: birim || 'adet',
    miktar: miktar ?? 1,
    fiyatlar: {},
    olusturuldu: new Date().toISOString(),
  };
  data.malzemeler.push(item);
  writeData(data);
  return item;
}

function updateMalzeme(id, patch) {
  const data = readData();
  const idx = data.malzemeler.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  data.malzemeler[idx] = { ...data.malzemeler[idx], ...patch, id };
  writeData(data);
  return data.malzemeler[idx];
}

function deleteMalzeme(id) {
  const data = readData();
  const before = data.malzemeler.length;
  data.malzemeler = data.malzemeler.filter((m) => m.id !== id);
  if (data.malzemeler.length === before) return false;
  writeData(data);
  return true;
}

function saveFiyat(id, storeKey, fiyatBilgisi) {
  const data = readData();
  const item = data.malzemeler.find((m) => m.id === id);
  if (!item) return null;
  item.fiyatlar[storeKey] = {
    ...fiyatBilgisi,
    guncellendi: new Date().toISOString(),
  };
  writeData(data);
  return item;
}

module.exports = {
  listMalzemeler,
  addMalzeme,
  updateMalzeme,
  deleteMalzeme,
  saveFiyat,
};
