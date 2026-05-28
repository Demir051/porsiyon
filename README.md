# Porsiyon

Öğün planı, aylık alışveriş listesi ve **A101** fiyatları için yerel web uygulaması.

Canlı site: https://porsiyon.vercel.app/

## Özellikler

- **Günlük öğün planı** — hazır liste, hafta içi / hafta sonu kartları
- **Aylık alışveriş** — bu ayın gerçek gün sayısına göre miktar; yemekhane günleri
- **A101 fiyatları** — [A101](https://www.a101.com.tr) market verileri
- **Malzeme çıkarma** — plandan istemediğin ürünü çıkar
- **Manuel supplement** — ad ve aylık fiyatı kendin gir
- **localStorage** — çekilen fiyatlar ve plan ayarları tarayıcıda kalır

## Kurulum

```bash
npm install
npm start
```

Tarayıcıda: **http://localhost:3456**

| Sayfa | URL |
|--------|-----|
| Ana sayfa | `/` |
| Öğün planı | `/plan.html` |
| Malzeme fiyatları | `/malzemeler.html` |

## Ortam

- Node.js 18+
- Port: `3456` (değiştirmek için `PORT=4000 npm start`)

## Veri

- `data/presets.json` — hazır öğün planları
- `data/malzemeler.json` — kullanıcı malzeme listesi (git’e eklenmez; örnek: `malzemeler.example.json`)

## API (özet)

| Endpoint | Açıklama |
|----------|----------|
| `GET /api/price?query=...` | A101 fiyatı |
| `POST /api/plan/compute` | Aylık miktar hesabı |
| `GET/POST /api/malzemeler` | Malzeme CRUD |

## Notlar

- Fiyatlar bilgilendirme amaçlıdır; mağaza fiyatları değişebilir.

## Lisans

MIT
