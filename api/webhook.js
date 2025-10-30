// api/webhook.js (debug - NÃO valida assinatura, só loga tudo)
const fs = require('fs');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // read raw body
    let raw = '';
    if (req.rawBody) {
      raw = (typeof req.rawBody === 'string') ? req.rawBody : req.rawBody.toString('utf8');
    } else if (req.body && typeof req.body === 'object') {
      raw = JSON.stringify(req.body);
    } else {
      raw = await new Promise((resolve, reject) => {
        let data = [];
        req.on('data', chunk => data.push(chunk));
        req.on('end', () => resolve(Buffer.concat(data).toString('utf8')));
        req.on('error', err => reject(err));
      });
    }

    // Save a small debug file (Vercel allows logs but helpfully also write to local file for quick copy)
    const log = {
      ts: new Date().toISOString(),
      headers: req.headers,
      rawBodyPreview: raw.slice(0, 4000),
    };
    console.log('WEBHOOK DEBUG:', JSON.stringify(log, null, 2));
    // optional: write to /tmp for quick download (temporary)
    try { fs.writeFileSync('/tmp/webhook_debug.json', JSON.stringify(log, null, 2)); } catch(e){}

    // return 200 so Mercado Pago considers webhook delivered
    return res.status(200).json({ ok: true, debug: true });
  } catch (err) {
    console.error('webhook debug error', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
