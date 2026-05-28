(function () {
  const PLAN_STORAGE_KEY = 'sporcuPlan:config:v2';
  const PRESET_ALIASES = { 'sporcu-demir': 'hazir-ogun-planim' };
  const DAY_LABELS = [
    { v: 1, l: 'Pzt' },
    { v: 2, l: 'Sal' },
    { v: 3, l: 'Çar' },
    { v: 4, l: 'Per' },
    { v: 5, l: 'Cum' },
    { v: 6, l: 'Cmt' },
    { v: 0, l: 'Paz' },
  ];

  let planConfig = null;
  let computedPlan = null;
  let manualSupplements = [];
  let presetCatalog = {};

  function resolvePresetId(id) {
    return PRESET_ALIASES[id] || id || 'hazir-ogun-planim';
  }

  function normalizePlanConfig(cfg) {
    if (!cfg) return null;
    const next = { ...cfg };
    next.presetId = resolvePresetId(next.presetId);
    delete next.daysPerMonth;
    if (!Array.isArray(next.excludedIngredientIds)) next.excludedIngredientIds = [];
    return next;
  }

  function formatTry(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }

  function formatMonthlyQty(item) {
    const q = item.monthlyQty;
    const u = item.monthlyUnit;
    if (u === 'kg') return `${q.toFixed(1).replace('.', ',')} kg`;
    if (u === 'adet') return `${Math.round(q)} adet`;
    return `${q} ${u}`;
  }

  function loadPlanConfig() {
    try {
      const raw = localStorage.getItem(PLAN_STORAGE_KEY);
      if (raw) return normalizePlanConfig(JSON.parse(raw));
    } catch {}
    return null;
  }

  function savePlanConfig() {
    try {
      localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(planConfig));
    } catch {}
  }

  function loadManualSupplements() {
    manualSupplements = PriceStore.getManualSupplements();
    if (!manualSupplements.length) {
      manualSupplements = [
        { id: 'sup_whey', name: 'Whey protein', price: null },
        { id: 'sup_kreatin', name: 'Kreatin monohidrat', price: null },
      ];
      saveManualSupplements();
    }
  }

  function saveManualSupplements() {
    PriceStore.setManualSupplements(manualSupplements);
  }

  function buildConfigFromUI() {
    ensurePlanConfig();
    const yemekhaneDays = DAY_LABELS.filter((d) =>
      document.getElementById(`yk-day-${d.v}`)?.checked
    ).map((d) => d.v);

    return {
      presetId: resolvePresetId(document.getElementById('plan-preset')?.value),
      yemekhaneEnabled: document.getElementById('plan-yemekhane')?.checked ?? true,
      yemekhaneDays,
      yemekhaneMeal: 'ogle',
      supplementsEnabled: document.getElementById('plan-supplements')?.checked ?? true,
      excludedIngredientIds: [...(planConfig.excludedIngredientIds || [])],
    };
  }

  function readConfigFromUI() {
    planConfig = buildConfigFromUI();
    savePlanConfig();
    return planConfig;
  }

  function getExcludedSet() {
    return new Set(planConfig?.excludedIngredientIds || []);
  }

  function applyClientExclusions() {
    if (!computedPlan) return;
    const excluded = getExcludedSet();
    if (!excluded.size) return;

    computedPlan.food = (computedPlan.food || []).filter((i) => !excluded.has(i.id));
    computedPlan.supplements = (computedPlan.supplements || []).filter((i) => !excluded.has(i.id));
    computedPlan.items = (computedPlan.items || []).filter((i) => !excluded.has(i.id));
  }

  function getVisibleFood() {
    const excluded = getExcludedSet();
    return (computedPlan?.food || []).filter((i) => !excluded.has(i.id));
  }

  function applyConfigToUI() {
    if (!planConfig) return;
    const preset = document.getElementById('plan-preset');
    const yk = document.getElementById('plan-yemekhane');
    const sup = document.getElementById('plan-supplements');
    if (preset) preset.value = planConfig.presetId || 'hazir-ogun-planim';
    if (yk) yk.checked = planConfig.yemekhaneEnabled !== false;
    if (sup) sup.checked = planConfig.supplementsEnabled !== false;
    for (const d of DAY_LABELS) {
      const el = document.getElementById(`yk-day-${d.v}`);
      if (el) el.checked = (planConfig.yemekhaneDays || []).includes(d.v);
    }
    document.getElementById('yk-days-wrap')?.classList.toggle(
      'hidden',
      !planConfig.yemekhaneEnabled
    );
    const supAcc = document.getElementById('supplement-manual-wrap');
    if (supAcc) {
      if (!planConfig.supplementsEnabled) {
        supAcc.classList.add('hidden');
        supAcc.open = false;
      } else {
        supAcc.classList.remove('hidden');
      }
    }
  }

  function parseMoney(text) {
    const n = Number(
      String(text || '')
        .replace(/[^\d,.-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
    );
    return Number.isFinite(n) ? n : 0;
  }

  function ensurePlanConfig() {
    if (!planConfig) {
      planConfig = loadPlanConfig() || {
        presetId: 'hazir-ogun-planim',
        yemekhaneEnabled: true,
        yemekhaneDays: [1, 2, 3, 4, 5],
        yemekhaneMeal: 'ogle',
        supplementsEnabled: true,
        excludedIngredientIds: [],
      };
    }
    if (!Array.isArray(planConfig.excludedIngredientIds)) {
      planConfig.excludedIngredientIds = [];
    }
  }

  function setExcludedIds(ids) {
    ensurePlanConfig();
    planConfig.excludedIngredientIds = [...new Set(ids)];
    savePlanConfig();
  }

  function refreshPlanView() {
    applyClientExclusions();
    renderMonthlyTable();
    updateCostSidebar();
  }

  function excludeIngredient(id) {
    if (!id) return;
    ensurePlanConfig();
    if (planConfig.excludedIngredientIds.includes(id)) return;

    setExcludedIds([...planConfig.excludedIngredientIds, id]);
    PriceStore.removePlanPrice(id);
    renderIngredientPicker();
    renderExcludedChips();

    if (computedPlan) refreshPlanView();
    recomputePlan();
  }

  function restoreIngredient(id) {
    ensurePlanConfig();
    setExcludedIds(planConfig.excludedIngredientIds.filter((x) => x !== id));
    renderIngredientPicker();
    renderExcludedChips();

    if (computedPlan) refreshPlanView();
    recomputePlan();
  }

  function renderIngredientPicker() {
    const wrap = document.getElementById('ingredient-picker');
    if (!wrap) return;
    const excluded = new Set(planConfig?.excludedIngredientIds || []);
    const entries = Object.entries(presetCatalog);
    if (!entries.length) {
      wrap.innerHTML = '<span class="mini">Plan yükleniyor…</span>';
      return;
    }
    wrap.innerHTML = entries
      .map(
        ([id, name]) => `
      <label class="ingredient-chip">
        <input type="checkbox" data-ing-id="${escapeAttr(id)}" ${excluded.has(id) ? '' : 'checked'} />
        ${escapeHtml(name)}
      </label>`
      )
      .join('');
  }

  function syncExcludedFromPicker() {
    const wrap = document.getElementById('ingredient-picker');
    if (!wrap) return;
    const excluded = [];
    for (const cb of wrap.querySelectorAll('input[data-ing-id]')) {
      if (!cb.checked) excluded.push(cb.getAttribute('data-ing-id'));
    }
    setExcludedIds(excluded);
    renderExcludedChips();
  }

  function renderExcludedChips() {
    const wrap = document.getElementById('excluded-chips');
    if (!wrap) return;
    const ids = planConfig?.excludedIngredientIds || [];
    if (!ids.length) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = ids
      .map(
        (id) =>
          `<button type="button" class="excluded-chip" data-id="${escapeAttr(id)}">${escapeHtml(presetCatalog[id] || id)} · geri ekle</button>`
      )
      .join('');
  }

  function updateMonthLabel() {
    const el = document.getElementById('plan-month-label');
    if (!el || !computedPlan) return;
    const days = computedPlan.daysPerMonth ?? computedPlan.calendar?.daysPerMonth;
    const label = computedPlan.monthLabel ?? computedPlan.calendar?.monthLabel;
    if (label && days) el.textContent = `${label} · ${days} gün`;
  }

  function sourceLabel(source) {
    if (source === 'a101') return 'A101';
    return source || '—';
  }

  function applyCachedPricesToRows() {
    const cache = PriceStore.getPlanPrices();
    const excluded = getExcludedSet();

    for (const row of document.querySelectorAll('tr[data-price-row]')) {
      const id = row.getAttribute('data-item-id');
      if (!id || excluded.has(id)) continue;
      const cached = cache[id];
      if (!cached) continue;
      setRowCells(row, {
        unitText: cached.unitText,
        sourceHtml: cached.sourceHtml,
        monthlyText: cached.monthlyText,
        monthlyTitle: cached.monthlyTitle,
      });
    }
    updateCostSidebar();
  }

  function updateCostSidebar() {
    const cache = PriceStore.getPlanPrices();
    const excluded = getExcludedSet();
    let food = 0;
    let sup = 0;

    for (const row of document.querySelectorAll('tr[data-price-row]')) {
      const id = row.getAttribute('data-item-id');
      if (id && excluded.has(id)) continue;
      const fromDom = parseMoney(row.querySelector("[data-cell='monthly']")?.textContent);
      const fromCache = parseMoney(cache[id]?.monthlyText);
      food += fromDom > 0 ? fromDom : fromCache;
    }
    for (const row of document.querySelectorAll('tr[data-manual-sup]')) {
      sup += parseMoney(row.querySelector("[data-cell='monthly']")?.textContent);
    }
    const total = food + sup;
    const days = computedPlan?.daysPerMonth ?? 30;
    const daily = days > 0 ? total / days : 0;
    const monthLabel = computedPlan?.monthLabel ?? '';

    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    set('cost-monthly-total', total > 0 ? `${formatTry(total)} TL` : '—');
    set('cost-daily-avg', total > 0 ? `${formatTry(daily)} TL` : '—');
    set('cost-food', food > 0 ? `${formatTry(food)} TL` : '—');
    set('cost-supplement', sup > 0 ? `${formatTry(sup)} TL` : '—');
    set('cost-aside-period', monthLabel ? `${monthLabel} · ${days} gün` : '—');
    set('cost-daily-sub', days ? `${days} güne bölünmüş ortalama` : '—');
  }

  function mealCardHtml(meal) {
    const pills = (meal.pills || [])
      .map((p) => `<span class="pill ${escapeAttr(p.class)}">${escapeHtml(p.text)}</span>`)
      .join('');
    const items = (meal.items || []).map((i) => `<li>${i}</li>`).join('');
    return `
      <article class="card">
        <div>
          <div class="kicker"><span class="badge ${escapeAttr(meal.badge)}">${escapeHtml(meal.type)}</span> ${escapeHtml(meal.time)}</div>
          <h3>${escapeHtml(meal.title)}</h3>
          <ul class="items">${items}</ul>
        </div>
        <div class="metrics">${pills}</div>
      </article>`;
  }

  function renderWeeklyPlan(preset) {
    const wp = preset?.weeklyPlan;
    window.__planWeeklyStats = wp
      ? { weekday: wp.weekday?.stats, weekend: wp.weekend?.stats }
      : null;
    if (!wp) return;

    const weekdayEl = document.getElementById('weekly-weekday');
    const weekendEl = document.getElementById('weekly-weekend');
    if (weekdayEl && wp.weekday?.meals) {
      weekdayEl.innerHTML = wp.weekday.meals.map(mealCardHtml).join('');
    }
    if (weekendEl && wp.weekend?.meals) {
      weekendEl.innerHTML = wp.weekend.meals.map(mealCardHtml).join('');
    }

    const noteWd = document.getElementById('note-weekday');
    const noteWe = document.getElementById('note-weekend');
    if (noteWd && wp.weekday?.note) noteWd.textContent = wp.weekday.note;
    if (noteWe && wp.weekend?.note) noteWe.textContent = wp.weekend.note;

    if (typeof window.setDayType === 'function') {
      const active =
        document.getElementById('btn-day-weekend')?.getAttribute('aria-selected') === 'true'
          ? 'weekend'
          : 'weekday';
      window.setDayType(active);
    }
  }

  function renderSupplementEditor() {
    const wrap = document.getElementById('supplement-list');
    if (!wrap) return;
    wrap.innerHTML = manualSupplements
      .map(
        (s, i) => `
      <div class="supplement-row" data-sup-idx="${i}">
        <input type="text" class="sup-name" value="${escapeAttr(s.name)}" placeholder="Supplement adı" />
        <input type="number" class="sup-price" min="0" step="0.01" value="${s.price != null ? s.price : ''}" placeholder="Aylık TL" />
        <button type="button" class="btn ghost small sup-remove">Sil</button>
      </div>`
      )
      .join('');
  }

  function manualSupplementRowsHtml() {
    if (!planConfig?.supplementsEnabled) return '';
    return manualSupplements
      .filter((s) => s.name?.trim())
      .map((s) => {
        const price = Number(s.price);
        const monthlyText = Number.isFinite(price) ? `${formatTry(price)} TL` : '—';
        return `
      <tr data-manual-sup data-sup-id="${escapeAttr(s.id)}">
        <td>${escapeHtml(s.name)}</td>
        <td><span class="badge b-warn">Supplement</span></td>
        <td class="mini">Manuel</td>
        <td><strong>1 ay</strong></td>
        <td class="price">Manuel</td>
        <td>—</td>
        <td class="price" data-cell="monthly">${monthlyText}</td>
        <td></td>
      </tr>`;
      })
      .join('');
  }

  async function fetchPresets() {
    const res = await fetch('/api/plan/presets');
    if (!res.ok) throw new Error('Planlar yüklenemedi');
    return res.json();
  }

  async function fetchPresetDetail(id) {
    const res = await fetch(`/api/plan/presets/${encodeURIComponent(resolvePresetId(id))}`);
    if (!res.ok) return null;
    return res.json();
  }

  async function loadPresetWeekly() {
    const id = planConfig?.presetId || document.getElementById('plan-preset')?.value;
    const preset = await fetchPresetDetail(id);
    if (preset) {
      presetCatalog = {};
      for (const ing of [...(preset.ingredients || []), ...(preset.supplements || [])]) {
        presetCatalog[ing.id] = ing.name;
      }
      renderWeeklyPlan(preset);
      renderIngredientPicker();
      renderExcludedChips();
    }
  }

  async function computePlanFromServer() {
    planConfig = buildConfigFromUI();
    savePlanConfig();

    const res = await fetch('/api/plan/compute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: planConfig }),
    });
    if (!res.ok) throw new Error('Hesaplama başarısız');
    computedPlan = await res.json();
    applyClientExclusions();
    return computedPlan;
  }

  function rowHtml(item) {
    const q = formatMonthlyQty(item);
    return `
      <tr data-price-row
          data-query="${escapeAttr(item.searchQuery)}"
          data-monthly-unit="${escapeAttr(item.monthlyUnit)}"
          data-monthly-qty="${item.monthlyQty}"
          data-item-id="${escapeAttr(item.id)}">
        <td>${escapeHtml(item.name)}</td>
        <td><span class="badge ${item.categoryClass}">${escapeHtml(item.category)}</span></td>
        <td class="mini">${escapeHtml(item.dailyLabel)}</td>
        <td><strong>${escapeHtml(item.monthlyLabel)}</strong><br><span class="mini">(${escapeHtml(q)})</span></td>
        <td class="price" data-cell="unit">—</td>
        <td data-cell="source">—</td>
        <td class="price" data-cell="monthly">—</td>
        <td><button type="button" class="btn ghost small btn-exclude" data-id="${escapeAttr(item.id)}">Çıkar</button></td>
      </tr>`;
  }

  function renderMonthlyTable() {
    const tbody = document.getElementById('monthly-tbody');
    if (!tbody || !computedPlan) return;

    applyClientExclusions();
    const foodItems = getVisibleFood();

    let html = '<tr class="sep"><td colspan="8">Gıda</td></tr>';
    if (!foodItems.length) {
      html += '<tr><td colspan="8" class="mini">Planda gıda malzemesi kalmadı.</td></tr>';
    }
    for (const item of foodItems) {
      html += rowHtml(item);
    }

    if (planConfig.supplementsEnabled) {
      html += '<tr class="sep"><td colspan="8">Supplement (manuel fiyat)</td></tr>';
      html += manualSupplementRowsHtml();
    }

    tbody.innerHTML = html;

    const days = computedPlan.daysPerMonth ?? computedPlan.calendar?.daysPerMonth;
    const monthLabel = computedPlan.monthLabel ?? computedPlan.calendar?.monthLabel;
    const sub = document.getElementById('monthly-subtitle');
    if (sub) {
      sub.textContent = `${monthLabel} · ${days} gün · ${computedPlan.presetName}`;
    }
    updateMonthLabel();
    renderExcludedChips();
    applyCachedPricesToRows();
  }

  function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t ?? '';
    return d.innerHTML;
  }

  function escapeAttr(t) {
    return String(t ?? '').replace(/"/g, '&quot;');
  }

  function setPriceStatus(text) {
    const el = document.getElementById('price-status');
    if (el) el.textContent = text ? ` · ${text}` : '';
  }

  async function fetchPrice(query, monthlyQty, monthlyUnit) {
    const params = new URLSearchParams({ query });
    if (Number.isFinite(monthlyQty) && monthlyQty > 0 && monthlyUnit) {
      params.set('monthlyQty', String(monthlyQty));
      params.set('monthlyUnit', monthlyUnit);
    }
    const res = await fetch(`/api/price?${params}`);
    if (!res.ok) throw new Error(`price_error_${res.status}`);
    return res.json();
  }

  function setRowCells(row, { unitText, sourceHtml, monthlyText, monthlyTitle }) {
    const unit = row.querySelector("[data-cell='unit']");
    const src = row.querySelector("[data-cell='source']");
    const mon = row.querySelector("[data-cell='monthly']");
    if (unit) unit.textContent = unitText ?? '—';
    if (src) src.innerHTML = sourceHtml ?? '—';
    if (mon) {
      mon.textContent = monthlyText ?? '—';
      if (monthlyTitle) mon.title = monthlyTitle;
      else mon.removeAttribute('title');
    }
  }

  function saveRowPriceCache(row, payload) {
    const id = row.getAttribute('data-item-id');
    if (!id) return;
    PriceStore.setPlanPrice(id, payload);
  }

  window.updatePrices = async function updatePrices() {
    if (!computedPlan) await window.recomputePlan();

    const rows = Array.from(document.querySelectorAll('tr[data-price-row]'));
    if (!rows.length) {
      updateCostSidebar();
      return;
    }

    setPriceStatus('fiyatlar çekiliyor…');
    let okCount = 0;
    let failCount = 0;

    for (const row of rows) {
      const query = row.getAttribute('data-query') || '';
      const qty = Number(row.getAttribute('data-monthly-qty') || '0');
      const unit = row.getAttribute('data-monthly-unit') || '';

      if (!query || !Number.isFinite(qty) || qty <= 0) {
        failCount += 1;
        continue;
      }

      try {
        const data = await fetchPrice(query, qty, unit);
        if (!data?.ok || !Number.isFinite(data.price)) {
          failCount += 1;
          setRowCells(row, { unitText: 'Bulunamadı', sourceHtml: '—', monthlyText: '—' });
          continue;
        }

        okCount += 1;
        const monthly = data.monthly?.total ?? Number(data.price) * qty;
        const label = sourceLabel(data.source);
        const link = data.url
          ? `<a class="link" href="${data.url}" target="_blank" rel="noreferrer">${label}</a>`
          : label;

        const payload = {
          unitText: data.monthly?.unitText || data.priceLabel || `${formatTry(data.price)} TL`,
          sourceHtml: link,
          monthlyText: `${formatTry(monthly)} TL`,
          monthlyTitle: [data.product, data.monthly?.note].filter(Boolean).join(' · '),
        };
        setRowCells(row, payload);
        saveRowPriceCache(row, payload);
      } catch {
        failCount += 1;
        setRowCells(row, { unitText: 'Hata', sourceHtml: '—', monthlyText: '—' });
      }

      setPriceStatus(`${okCount} bulundu · ${failCount} yok`);
    }

    updateCostSidebar();
    setPriceStatus(`bitti: ${okCount} bulundu · ${failCount} yok`);
  };

  async function recomputePlan() {
    try {
      setPriceStatus('liste güncelleniyor…');
      readSupplementsFromEditor();
      await computePlanFromServer();
      renderMonthlyTable();
      await loadPresetWeekly();
      setPriceStatus('');
    } catch (err) {
      setPriceStatus(err.message, true);
      alert(err.message);
    }
  }
  window.recomputePlan = recomputePlan;

  function readSupplementsFromEditor() {
    const rows = document.querySelectorAll('.supplement-row');
    manualSupplements = Array.from(rows).map((row, i) => {
      const name = row.querySelector('.sup-name')?.value?.trim() || '';
      const priceRaw = row.querySelector('.sup-price')?.value;
      const price = priceRaw === '' || priceRaw == null ? null : Number(priceRaw);
      const existing = manualSupplements[i];
      return {
        id: existing?.id || `sup_${Date.now()}_${i}`,
        name,
        price: Number.isFinite(price) ? price : null,
      };
    });
    saveManualSupplements();
  }

  window.syncToMalzemeler = async function syncToMalzemeler() {
    if (!confirm('Plandaki tüm malzemeler fiyat listesine eklenecek. Devam?')) return;
    readConfigFromUI();
    try {
      const res = await fetch('/api/plan/sync-malzemeler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: planConfig }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Senkron başarısız');
      alert(`${data.count} malzeme eklendi. Malzeme fiyatları sayfasından fiyat çekebilirsiniz.`);
      window.location.href = '/malzemeler.html';
    } catch (err) {
      alert(err.message);
    }
  };

  function bindSupplementEditor() {
    document.getElementById('sup-add-btn')?.addEventListener('click', () => {
      manualSupplements.push({ id: `sup_${Date.now()}`, name: '', price: null });
      renderSupplementEditor();
    });

    document.getElementById('supplement-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.sup-remove');
      if (!btn) return;
      const row = btn.closest('.supplement-row');
      const idx = Number(row?.getAttribute('data-sup-idx'));
      if (!Number.isFinite(idx)) return;
      manualSupplements.splice(idx, 1);
      saveManualSupplements();
      renderSupplementEditor();
      recomputePlan();
    });

    document.getElementById('supplement-list')?.addEventListener('change', () => {
      readSupplementsFromEditor();
      renderMonthlyTable();
      updateCostSidebar();
    });
  }

  async function initPlanUI() {
    const presetSelect = document.getElementById('plan-preset');
    if (!presetSelect) return;

    loadManualSupplements();
    renderSupplementEditor();
    bindSupplementEditor();

    const { presets } = await fetchPresets();
    presetSelect.innerHTML = presets
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
      .join('');

    planConfig = loadPlanConfig() || {
      presetId: 'hazir-ogun-planim',
      yemekhaneEnabled: true,
      yemekhaneDays: [1, 2, 3, 4, 5],
      yemekhaneMeal: 'ogle',
      supplementsEnabled: true,
      excludedIngredientIds: [],
    };

    applyConfigToUI();

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-exclude');
      if (btn) {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        if (id) excludeIngredient(id);
        return;
      }
      const chip = e.target.closest('.excluded-chip');
      if (chip) {
        e.preventDefault();
        const id = chip.getAttribute('data-id');
        if (id) restoreIngredient(id);
      }
    });

    document.getElementById('ingredient-picker')?.addEventListener('change', (e) => {
      if (e.target.matches('input[data-ing-id]')) {
        syncExcludedFromPicker();
        const excluded = getExcludedSet();
        for (const id of excluded) PriceStore.removePlanPrice(id);
        if (computedPlan) refreshPlanView();
        recomputePlan();
      }
    });

    presetSelect.addEventListener('change', () => {
      ensurePlanConfig();
      planConfig.excludedIngredientIds = [];
      savePlanConfig();
      recomputePlan();
    });
    document.getElementById('plan-yemekhane')?.addEventListener('change', (e) => {
      document.getElementById('yk-days-wrap')?.classList.toggle('hidden', !e.target.checked);
      recomputePlan();
    });
    document.getElementById('plan-supplements')?.addEventListener('change', () => {
      applyConfigToUI();
      recomputePlan();
    });
    for (const d of DAY_LABELS) {
      document.getElementById(`yk-day-${d.v}`)?.addEventListener('change', () => recomputePlan());
    }

    await recomputePlan();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlanUI);
  } else {
    initPlanUI();
  }
})();
