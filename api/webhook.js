// api/webhook.js
const crypto = require('crypto');
const fs = require('fs');

const WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || "";

function computeHmacSha256(secret, payload) {
  return crypto.createHmac('sha256', String(secret)).update(payload, 'utf8').digest('hex');
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // get raw body
    let raw = '';
    if (req.rawBody) {
      raw = (typeof req.rawBody === 'string') ? req.rawBody : req.rawBody.toString('utf8');
    } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
      raw = JSON.stringify(req.body);
    } else {
      raw = await new Promise((resolve, reject) => {
        let data = [];
        req.on('data', chunk => data.push(chunk));
        req.on('end', () => resolve(Buffer.concat(data).toString('utf8')));
        req.on('error', err => reject(err));
      });
    }

    // optional signature verification
    let verified = false;
    let signatureHeader = req.headers['x-hook-signature'] || req.headers['x-hub-signature'] || req.headers['x-hub-signature-256'] || req.headers['x-signature'] || req.headers['x-mercadopago-signature'];
    if (WEBHOOK_SECRET) {
      if (!signatureHeader) {
        console.warn('Webhook secret configured but no signature header received.');
      } else {
        // compute hmac and compare (accept hex)
        const computed = computeHmacSha256(WEBHOOK_SECRET, raw);
        const incoming = String(signatureHeader).replace(/^(sha256=|sha1=)/i, '').trim();
        if (computed === incoming) verified = true;
        else console.warn('Webhook signature mismatch. incoming:', incoming, 'computed:', computed);
      }
    } else {
      verified = true; // no secret => accept (debug mode)
    }

    const log = {
      ts: new Date().toISOString(),
      headers: req.headers,
      verified,
      rawBodyPreview: raw.slice(0, 4000),
    };
    console.log('WEBHOOK DEBUG:', JSON.stringify(log, null, 2));
    try { fs.writeFileSync('/tmp/webhook_debug.json', JSON.stringify(log, null, 2)); } catch(e){}

    if (!verified) {
      return res.status(401).json({ ok: false, error: 'Not Authorized - invalid signature' });
    }

    // aqui você pode processar o evento (ex: atualizar Firestore, etc)
    // Exemplo simples:
    // const payload = JSON.parse(raw);
    // if(payload.action === 'payment.updated') { ... }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('webhook debug error', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
