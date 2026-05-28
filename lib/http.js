const https = require('https');

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function fetchJson(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'tr-TR,tr;q=0.9',
          ...extraHeaders,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 120)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error('Geçersiz JSON yanıtı'));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('İstek zaman aşımına uğradı'));
    });
    req.end();
  });
}

function fetchHtml(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'tr-TR,tr;q=0.9',
          ...extraHeaders,
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).href;
          fetchHtml(next, extraHeaders).then(resolve).catch(reject);
          return;
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 120)}`));
            return;
          }
          resolve(data);
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error('İstek zaman aşımına uğradı'));
    });
    req.end();
  });
}

module.exports = { fetchJson, fetchHtml, BROWSER_UA };
