(function (global) {
  const PREFIX = 'malzemeFiyat:';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {}
  }

  function monthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  const PriceStore = {
    getPlanPrices(mk = monthKey()) {
      return read(`planPrices:${mk}`, {});
    },
    setPlanPrice(itemId, data, mk = monthKey()) {
      const all = read(`planPrices:${mk}`, {});
      all[itemId] = { ...data, savedAt: Date.now() };
      write(`planPrices:${mk}`, all);
    },
    removePlanPrice(itemId, mk = monthKey()) {
      const all = read(`planPrices:${mk}`, {});
      delete all[itemId];
      write(`planPrices:${mk}`, all);
    },
    getMalzemePrices() {
      return read('malzemePrices', {});
    },
    setMalzemePrice(id, fiyatlar) {
      const all = read('malzemePrices', {});
      all[id] = { fiyatlar, savedAt: Date.now() };
      write('malzemePrices', all);
    },
    getManualSupplements() {
      return read('manualSupplements', []);
    },
    setManualSupplements(list) {
      write('manualSupplements', list);
    },
    monthKey,
  };

  global.PriceStore = PriceStore;
})(typeof window !== 'undefined' ? window : global);
