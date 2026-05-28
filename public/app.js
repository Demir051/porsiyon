const durumEl = document.getElementById('durum');
const listeEl = document.getElementById('malzemeListesi');
const bosMesajEl = document.getElementById('bosMesaj');
const formEl = document.getElementById('formMalzeme');
const btnGuncelleHepsi = document.getElementById('btnGuncelleHepsi');
const statCount = document.getElementById('stat-count');
const statPriced = document.getElementById('stat-priced');
const ozetAlt = document.getElementById('ozet-alt');

function setDurum(msg, isError = false) {
  durumEl.textContent = msg;
  durumEl.classList.toggle('error', isError);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'İstek başarısız');
  return data;
}

function formatTarih(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mergeCachedFiyatlar(malzemeler) {
  const cache = PriceStore.getMalzemePrices();
  return malzemeler.map((m) => {
    const cached = cache[m.id];
    if (!cached?.fiyatlar) return m;
    return {
      ...m,
      fiyatlar: { ...m.fiyatlar, ...cached.fiyatlar },
    };
  });
}

function fiyatKutuHtml(bilgi) {
  if (!bilgi?.fiyat) {
    return `
      <div class="fiyat-kutu a101">
        <div class="kicker"><span class="badge b-a101">A101</span></div>
        <div class="fiyat-bos">Henüz fiyat yok</div>
      </div>`;
  }

  return `
    <div class="fiyat-kutu a101">
      <div class="kicker"><span class="badge b-a101">A101</span></div>
      <div class="fiyat-tutar">${escapeHtml(bilgi.fiyatLabel || `${bilgi.fiyat} TL`)}</div>
      <div class="fiyat-urun">
        <a href="${bilgi.url}" target="_blank" rel="noopener">${escapeHtml(bilgi.urunAdi)}</a>
        <br /><small>Güncellendi: ${formatTarih(bilgi.guncellendi)}</small>
      </div>
    </div>`;
}

function malzemeKartHtml(m) {
  const a101 = m.fiyatlar?.a101;
  const priceHtml = a101?.fiyat
    ? `<span class="pill good">A101 — ${escapeHtml(a101.fiyatLabel || `${a101.fiyat} TL`)}</span>`
    : '';

  return `
    <article class="malzeme-kart" data-id="${m.id}">
      <div>
        <div class="malzeme-baslik">
          <h3>${escapeHtml(m.ad)}</h3>
          <span class="badge">${escapeHtml(String(m.miktar))} ${escapeHtml(m.birim)}</span>
        </div>
        <div class="fiyat-grid fiyat-grid-single">
          ${fiyatKutuHtml(a101)}
        </div>
        ${priceHtml}
      </div>
      <div class="aksiyonlar">
        <button type="button" class="btn ghost small btn-guncelle" data-id="${m.id}">Güncelle</button>
        <button type="button" class="btn danger small btn-sil" data-id="${m.id}">Sil</button>
      </div>
    </article>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function guncelleOzet(malzemeler) {
  const count = malzemeler.length;
  const priced = malzemeler.filter((m) => m.fiyatlar?.a101?.fiyat != null).length;

  if (statCount) statCount.textContent = String(count);
  if (statPriced) statPriced.textContent = String(priced);
  if (ozetAlt) {
    ozetAlt.textContent =
      count === 0 ? 'Liste boş' : `${priced}/${count} malzemenin A101 fiyatı var`;
  }
}

function renderListe(malzemeler) {
  const merged = mergeCachedFiyatlar(malzemeler);
  guncelleOzet(merged);

  if (!merged.length) {
    listeEl.innerHTML = '';
    bosMesajEl.classList.remove('hidden');
    return;
  }

  bosMesajEl.classList.add('hidden');
  listeEl.innerHTML = merged.map(malzemeKartHtml).join('');
}

async function yukle() {
  const { malzemeler } = await api('/api/malzemeler');
  renderListe(malzemeler);
}

async function guncelleTek(id) {
  setDurum('A101 fiyatı çekiliyor…');
  const { malzeme } = await api(`/api/malzemeler/${id}/guncelle`, {
    method: 'POST',
    body: '{}',
  });
  if (malzeme?.fiyatlar) {
    PriceStore.setMalzemePrice(id, malzeme.fiyatlar);
  }
  await yukle();
  setDurum('Fiyat güncellendi.');
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(formEl);
  const body = Object.fromEntries(fd.entries());
  body.miktar = Number(body.miktar);

  try {
    setDurum('Malzeme ekleniyor…');
    btnGuncelleHepsi.disabled = true;
    const item = await api('/api/malzemeler', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    await guncelleTek(item.id);
    formEl.reset();
    formEl.miktar.value = 1;
  } catch (err) {
    setDurum(err.message, true);
  } finally {
    btnGuncelleHepsi.disabled = false;
  }
});

listeEl.addEventListener('click', async (e) => {
  const guncelle = e.target.closest('.btn-guncelle');
  const sil = e.target.closest('.btn-sil');

  if (guncelle) {
    try {
      guncelle.disabled = true;
      await guncelleTek(guncelle.dataset.id);
    } catch (err) {
      setDurum(err.message, true);
    } finally {
      guncelle.disabled = false;
    }
  }

  if (sil) {
    if (!confirm('Bu malzemeyi silmek istediğinize emin misiniz?')) return;
    try {
      await api(`/api/malzemeler/${sil.dataset.id}`, { method: 'DELETE' });
      await yukle();
      setDurum('Malzeme silindi.');
    } catch (err) {
      setDurum(err.message, true);
    }
  }
});

btnGuncelleHepsi.addEventListener('click', async () => {
  try {
    btnGuncelleHepsi.disabled = true;
    setDurum('Tüm malzemeler için A101 fiyatları çekiliyor…');
    const { malzemeler } = await api('/api/malzemeler/guncelle', {
      method: 'POST',
      body: '{}',
    });
    for (const m of malzemeler || []) {
      if (m.fiyatlar) PriceStore.setMalzemePrice(m.id, m.fiyatlar);
    }
    await yukle();
    setDurum('Tüm fiyatlar güncellendi.');
  } catch (err) {
    setDurum(err.message, true);
  } finally {
    btnGuncelleHepsi.disabled = false;
  }
});

yukle().catch((err) => setDurum(err.message, true));
