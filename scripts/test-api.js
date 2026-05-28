const http = require('http');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3456,
        path,
        method,
        headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const add = await request('POST', '/api/malzemeler', { ad: 'süt', birim: 'lt', miktar: 1 });
  console.log('add', add.status, add.body);
  if (add.body?.id) {
    const g = await request('POST', `/api/malzemeler/${add.body.id}/guncelle`, {});
    console.log('guncelle', g.status, JSON.stringify(g.body, null, 2).slice(0, 1500));
  }
})();
