/**
 * Aylık ihtiyaç ile mağazadaki satış birimini (paket / kg / adet) eşleştirir.
 */

function parseAmount(str) {
  return parseFloat(String(str).replace(',', '.'));
}

function parsePackageFromName(name) {
  const n = (name || '').toLocaleLowerCase('tr-TR');

  const lu = n.match(/(\d+)\s*['']?\s*lu\b/);
  if (lu) {
    return { type: 'piece', count: Number(lu[1]), label: `${lu[1]}'lu` };
  }

  const multi = n.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gram|ml|l|lt|litre)\b/);
  if (multi) {
    const pieces = Number(multi[1]);
    const size = parseAmount(multi[2]);
    const u = multi[3];
    if (u === 'kg') {
      const grams = pieces * size * 1000;
      return { type: 'piece', grams, label: `${pieces}×${multi[2]} kg` };
    }
    if (u === 'l' || u === 'lt' || u === 'litre') {
      const ml = pieces * size * 1000;
      return { type: 'piece', ml, label: `${pieces}×${multi[2]} L` };
    }
    const grams = u === 'ml' ? null : pieces * size;
    const ml = u === 'ml' ? pieces * size : null;
    return {
      type: 'piece',
      grams: grams || undefined,
      ml: ml || undefined,
      label: `${pieces}×${multi[2]} ${u}`,
    };
  }

  const single = n.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gram|ml|l|lt|litre)\b/);
  if (single) {
    const val = parseAmount(single[1]);
    const u = single[2];
    if (u === 'kg') {
      return { type: 'piece', grams: val * 1000, label: `${single[1]} kg` };
    }
    if (u === 'l' || u === 'lt' || u === 'litre') {
      return { type: 'piece', ml: val * 1000, label: `${single[1]} L` };
    }
    if (u === 'ml') {
      return { type: 'piece', ml: val, label: `${single[1]} ml` };
    }
    return { type: 'piece', grams: val, label: `${single[1]} g` };
  }

  return null;
}

function normalizeMonthlyNeed(qty, unit) {
  const u = (unit || '').toLowerCase();
  if (u === 'kg') return { grams: qty * 1000, ml: null, adet: null };
  if (u === 'g') return { grams: qty, ml: null, adet: null };
  if (u === 'lt' || u === 'l') return { grams: null, ml: qty * 1000, adet: null };
  if (u === 'ml') return { grams: null, ml: qty, adet: null };
  if (u === 'adet') return { grams: null, ml: null, adet: qty };
  return { grams: null, ml: null, adet: qty };
}

function buildProductPackage(product) {
  const price = Number(product.price);
  const parsed = parsePackageFromName(product.name);

  if (product.sellType === 'weight' && product.pricePerKg) {
    return {
      packagePrice: price,
      sellType: 'weight',
      pricePerKg: product.pricePerKg,
      packageLabel: product.packageLabel || 'kg',
      packageKg: 1,
    };
  }

  if (parsed?.grams) {
    return {
      packagePrice: price,
      sellType: 'piece',
      packageGrams: parsed.grams,
      packageLabel: parsed.label,
    };
  }

  if (parsed?.ml) {
    return {
      packagePrice: price,
      sellType: 'piece',
      packageMl: parsed.ml,
      packageLabel: parsed.label,
    };
  }

  if (parsed?.count) {
    return {
      packagePrice: price,
      sellType: 'piece',
      packageCount: parsed.count,
      packageLabel: parsed.label,
    };
  }

  if (product.packageGrams) {
    return {
      packagePrice: price,
      sellType: 'piece',
      packageGrams: product.packageGrams,
      packageLabel: product.packageLabel,
    };
  }

  if (product.packageMl) {
    return {
      packagePrice: price,
      sellType: 'piece',
      packageMl: product.packageMl,
      packageLabel: product.packageLabel,
    };
  }

  return {
    packagePrice: price,
    sellType: 'unknown',
    packageLabel: product.packageLabel || 'birim',
  };
}

function computeMonthlyCost(monthlyQty, monthlyUnit, product) {
  const pkg = buildProductPackage(product);
  const need = normalizeMonthlyNeed(monthlyQty, monthlyUnit);
  const result = {
    monthlyQty,
    monthlyUnit,
    packagePrice: pkg.packagePrice,
    packageLabel: pkg.packageLabel,
    packagesNeeded: null,
    total: null,
    unitText: null,
    monthlyText: null,
    note: null,
  };

  if (pkg.sellType === 'weight' && pkg.pricePerKg && need.grams != null) {
    const needKg = need.grams / 1000;
    const total = pkg.pricePerKg * needKg;
    result.packagesNeeded = needKg;
    result.total = total;
    result.unitText = `${pkg.pricePerKg.toFixed(2).replace('.', ',')} TL/kg`;
    result.monthlyText = `${total.toFixed(2).replace('.', ',')} TL`;
    result.note = `${needKg.toFixed(1).replace('.', ',')} kg × kg fiyatı`;
    return result;
  }

  if (pkg.packageGrams && need.grams != null) {
    const packs = Math.ceil(need.grams / pkg.packageGrams);
    const total = packs * pkg.packagePrice;
    result.packagesNeeded = packs;
    result.total = total;
    result.unitText = `${pkg.packagePrice.toFixed(2).replace('.', ',')} TL / ${pkg.packageLabel}`;
    result.monthlyText = `${total.toFixed(2).replace('.', ',')} TL`;
    result.note = `${packs} paket × ${pkg.packageLabel} (${(need.grams / 1000).toFixed(1).replace('.', ',')} kg ihtiyaç)`;
    return result;
  }

  if (pkg.packageMl && need.ml != null) {
    const packs = Math.ceil(need.ml / pkg.packageMl);
    const total = packs * pkg.packagePrice;
    result.packagesNeeded = packs;
    result.total = total;
    result.unitText = `${pkg.packagePrice.toFixed(2).replace('.', ',')} TL / ${pkg.packageLabel}`;
    result.monthlyText = `${total.toFixed(2).replace('.', ',')} TL`;
    result.note = `${packs} paket × ${pkg.packageLabel}`;
    return result;
  }

  if (pkg.packageCount && need.adet != null) {
    const packs = Math.ceil(need.adet / pkg.packageCount);
    const total = packs * pkg.packagePrice;
    result.packagesNeeded = packs;
    result.total = total;
    result.unitText = `${pkg.packagePrice.toFixed(2).replace('.', ',')} TL / ${pkg.packageLabel}`;
    result.monthlyText = `${total.toFixed(2).replace('.', ',')} TL`;
    result.note = `${packs} koli × ${pkg.packageLabel} (${need.adet} adet)`;
    return result;
  }

  if (need.adet != null && monthlyUnit === 'adet') {
    const packs = monthlyQty % 1 !== 0 ? monthlyQty : Math.ceil(need.adet);
    const total = packs * pkg.packagePrice;
    result.packagesNeeded = packs;
    result.total = total;
    result.unitText = `${pkg.packagePrice.toFixed(2).replace('.', ',')} TL / adet`;
    result.monthlyText = `${total.toFixed(2).replace('.', ',')} TL`;
    result.note = packs === need.adet ? `${packs} adet` : `${packs} paket`;
    return result;
  }

  const fallback = pkg.packagePrice * monthlyQty;
  result.total = fallback;
  result.packagesNeeded = monthlyQty;
  result.unitText = `${pkg.packagePrice.toFixed(2).replace('.', ',')} TL`;
  result.monthlyText = `${fallback.toFixed(2).replace('.', ',')} TL`;
  result.note = 'Paket boyutu tahmin edilemedi; basit çarpım kullanıldı';
  return result;
}

module.exports = {
  parsePackageFromName,
  buildProductPackage,
  computeMonthlyCost,
};
