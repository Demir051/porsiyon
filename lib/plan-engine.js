const DAY_NAMES = ['paz', 'pzt', 'sal', 'çar', 'per', 'cum', 'cmt'];

function resolveCalendar(config = {}) {
  const now = new Date();
  const year = config.year ?? now.getFullYear();
  const month = config.month ?? now.getMonth();
  const daysPerMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = new Date(year, month, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });

  return { year, month, daysPerMonth, monthLabel };
}

function slotEffectiveDays(slot, calendar, yemekhaneConfig) {
  const { yemekhaneEnabled, yemekhaneDays = [], yemekhaneMeal = 'ogle' } = yemekhaneConfig;
  let days = 0;

  for (let day = 1; day <= calendar.daysPerMonth; day++) {
    const dow = new Date(calendar.year, calendar.month, day).getDay();
    const isWeekday = dow >= 1 && dow <= 5;
    const isWeekend = dow === 0 || dow === 6;

    let match = false;
    if (slot.dayFilter === 'daily') match = true;
    else if (slot.dayFilter === 'weekday') match = isWeekday;
    else if (slot.dayFilter === 'weekend') match = isWeekend;
    else if (Array.isArray(slot.dayFilter)) match = slot.dayFilter.includes(dow);

    if (!match) continue;

    if (
      yemekhaneEnabled &&
      slot.meal === yemekhaneMeal &&
      yemekhaneDays.includes(dow)
    ) {
      continue;
    }

    days++;
  }

  return days;
}

function formatAmount(amount, unit) {
  if (unit === 'g' && amount >= 1000) {
    return `${(amount / 1000).toFixed(1).replace('.', ',')} kg`;
  }
  if (unit === 'ml' && amount >= 1000) {
    return `${(amount / 1000).toFixed(1).replace('.', ',')} L`;
  }
  if (unit === 'g' || unit === 'ml') {
    return `${Math.round(amount)} ${unit}`;
  }
  return `${amount} ${unit}`;
}

function toMonthlyQty(total, ing) {
  if (ing.monthlyQtyOverride != null) return ing.monthlyQtyOverride;

  const unit = ing.monthlyUnit || ing.unit;
  if (unit === 'kg' && ing.unit === 'g') return total / 1000;
  if (unit === 'kg' && ing.unit === 'adet' && ing.gramsPerUnit) {
    return (total * ing.gramsPerUnit) / 1000;
  }
  if (unit === 'adet' && ing.unit === 'g') return total;
  if (unit === 'adet' && ing.unit === 'adet') return total;
  if (unit === 'adet' && ing.unit === 'ml') return Math.ceil(total / 500);
  return total;
}

function buildDailyLabel(slots, yemekhaneConfig) {
  const parts = slots.map((s) => {
    const days =
      s.dayFilter === 'daily'
        ? 'günlük'
        : s.dayFilter === 'weekday'
          ? 'h.içi'
          : s.dayFilter === 'weekend'
            ? 'h.sonu'
            : 'özel';
    const yk =
      yemekhaneConfig?.yemekhaneEnabled &&
      s.meal === yemekhaneConfig.yemekhaneMeal &&
      (s.dayFilter === 'weekday' || s.dayFilter === 'daily')
        ? '†'
        : '';
    return `${formatAmount(s.amount, s.unit || 'g')} ${s.meal} (${days})${yk}`;
  });
  return parts.join(' + ');
}

function computeIngredient(ing, config) {
  const calendar = resolveCalendar(config);
  const yemekhane = {
    yemekhaneEnabled: config.yemekhaneEnabled,
    yemekhaneDays: config.yemekhaneDays || [1, 2, 3, 4, 5],
    yemekhaneMeal: config.yemekhaneMeal || 'ogle',
  };

  let total = 0;
  const breakdown = [];

  for (const slot of ing.slots || []) {
    const days = slotEffectiveDays(slot, calendar, yemekhane);
    const amount = slot.amount * days;
    total += amount;
    if (days > 0) {
      breakdown.push({
        meal: slot.meal,
        dayFilter: slot.dayFilter,
        perDay: slot.amount,
        days,
        subtotal: amount,
        unit: ing.unit,
      });
    }
  }

  const monthlyQty = toMonthlyQty(total, ing);
  const monthlyUnit = ing.monthlyUnit || ing.unit;

  return {
    id: ing.id,
    name: ing.name,
    searchQuery: ing.searchQuery,
    category: ing.category,
    categoryClass: ing.categoryClass || 'b-neutral',
    unit: ing.unit,
    monthlyQty,
    monthlyUnit,
    totalRaw: total,
    dailyLabel: buildDailyLabel(ing.slots, yemekhane),
    monthlyLabel: formatAmount(total, ing.unit),
    breakdown,
    isSupplement: false,
  };
}

function computePlan(config, preset) {
  const calendar = resolveCalendar(config);
  const mergedConfig = { ...config, ...calendar };
  const excluded = new Set(mergedConfig.excludedIngredientIds || []);

  const items = (preset.ingredients || [])
    .filter((ing) => !excluded.has(ing.id))
    .map((ing) => computeIngredient(ing, mergedConfig));

  if (mergedConfig.supplementsEnabled !== false && preset.supplements?.length) {
    for (const sup of preset.supplements) {
      if (excluded.has(sup.id)) continue;
      items.push({ ...computeIngredient(sup, mergedConfig), isSupplement: true });
    }
  }

  const food = items.filter((i) => !i.isSupplement);
  const supplements = items.filter((i) => i.isSupplement);

  return {
    items,
    food,
    supplements,
    config: mergedConfig,
    calendar,
    daysPerMonth: calendar.daysPerMonth,
    monthLabel: calendar.monthLabel,
    presetId: preset.id,
    presetName: preset.name,
  };
}

function defaultConfig() {
  return {
    presetId: 'hazir-ogun-planim',
    yemekhaneEnabled: true,
    yemekhaneDays: [1, 2, 3, 4, 5],
    yemekhaneMeal: 'ogle',
    supplementsEnabled: true,
    excludedIngredientIds: [],
  };
}

module.exports = {
  DAY_NAMES,
  computePlan,
  computeIngredient,
  defaultConfig,
  resolveCalendar,
  slotEffectiveDays,
};
