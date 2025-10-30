// api/webhook.js
// Verifica assinatura enviada pelo Mercado Pago (HMAC-SHA256) usando MP_WEBHOOK_SECRET
// e, opcionalmente, salva o status do pagamento no Firestore se FIREBASE_SERVICE_ACCOUNT estiver configurado.

const crypto = require('crypto');
const axios = require('axios');

let admin = null;
let db = null;

// Inicializa Firebase Admin se tiver FIREBASE_SERVICE_ACCOUNT
function initFirebaseIfConfigured() {
  if (db) return;
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svc) return;
  try {
    const svcJson = (() => {
      try { return JSON.parse(svc); } catch(e) {
        // pode estar em base64
        const dec = Buffer.from(svc, 'base64').toString('utf8');
        return JSON.parse(dec);
      }
    })();

    admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(svcJson),
      });
    }
    db = admin.firestore();
    console.log('Firebase admin inicializado para webhook.');
  } catch (err) {
    console.error('Erro inicializando Firebase service account:', err.message || err);
  }
}

// Faz validação segura da assinatura (HMAC SHA256 do body)
function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  try {
    // Alguns headers podem vir com prefixos; aceitamos hex direto.
    // Calcular HMAC-SHA256 do rawBody
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody, 'utf8');
    const digest = hmac.digest('hex');

    // Assinatura pode vir em header como: 'sha256=HEX' ou apenas 'HEX'
    const sig = signature.includes('=') ? signature.split('=')[1] : signature;

    const a = Buffer.from(digest, 'hex');
    const b = Buffer.from(sig, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    console.error('verifySignature erro:', err.message || err);
    return false;
  }
}

// lê raw body de forma segura no ambiente serverless
async function readRawBody(req) {
  // se Vercel/Framework já deixou rawBody disponível
  if (req.rawBody && typeof req.rawBody === 'string') return req.rawBody;
  if (req.rawBody && Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');

  // se o body já estiver parseado, convertemos para string (fallback)
  if (req.body && typeof req.body === 'object') {
    try { return JSON.stringify(req.body); } catch(e) { /* ignore */ }
  }

  // fallback: ler stream
  return await new Promise((resolve, reject) => {
    let data = [];
    req.on('data', chunk => data.push(chunk));
    req.on('end', () => resolve(Buffer.concat(data).toString('utf8')));
    req.on('error', err => reject(err));
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const secret = process.env.MP_WEBHOOK_SECRET;
    const possibleHeaderNames = [
      'x-signature',
      'x-signature-256',
      'x-hub-signature-256',
      'x-webhook-signature',
      'x-hook-signature',
      'x-hub-signature'
    ];

    // lê raw body
    const rawBody = await readRawBody(req);

    // extrai assinatura do header (qualquer um)
    let signature = null;
    for (const h of possibleHeaderNames) {
      if (req.headers && req.headers[h]) { signature = req.headers[h]; break; }
    }

    // se tiver secret configurado — valida
    if (secret) {
      const ok = verifySignature(rawBody, signature || '', secret);
      if (!ok) {
        console.warn('Webhook: assinatura inválida.', { hasHeader: !!signature });
        return res.status(401).json({ ok: false, msg: 'assinatura inválida' });
      }
    } else {
      console.warn('Webhook: MP_WEBHOOK_SECRET não configurado — pulando validação.');
    }

    // parse da payload (JSON esperado)
    let payload;
    try { payload = JSON.parse(rawBody); } catch (e) { payload = req.body || {}; }

    console.log('Webhook recebido (payload):', JSON.stringify(payload).slice(0,2000));

    // Manejar notificações de pagamento
    // Mercado Pago pode enviar diferentes formatos (ex: {action:"payment.created", data:{id:...}} ou {type, data})
    const eventType = payload.type || payload.action || payload.topic || null;

    // tenta extrair payment id do corpo
    let paymentId = null;
    if (payload.data && (payload.data.id || payload.data.payment_id)) paymentId = payload.data.id || payload.data.payment_id;
    if (!paymentId && payload.id) paymentId = payload.id;
    // alguns webhooks enviam: payload.resource.id
    if (!paymentId && payload.resource && payload.resource.id) paymentId = payload.resource.id;

    // se temos paymentId, consultar a API Mercado Pago para detalhes (opcional)
    let paymentInfo = null;
    if (paymentId) {
      try {
        const mpResp = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN || ''}`
          },
          timeout: 10000
        });
        paymentInfo = mpResp.data;
      } catch (err) {
        console.warn('Erro consultando pagamento MP:', err.response?.data || err.message || err);
      }
    }

    // inicializa Firestore (se configurado)
    initFirebaseIfConfigured();

    // Salvar registro no Firestore (opcional)
    if (db) {
      try {
        const docId = paymentId || `webhook-${Date.now()}`;
        const docRef = db.collection('pedidos').doc(String(docId));
        await docRef.set({
          received_at: admin.firestore.FieldValue.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
          event: eventType || null,
          raw: payload,
          paymentInfo: paymentInfo || null,
        }, { merge: true });
        console.log('Webhook salvo em Firestore:', docId);
      } catch (err) {
        console.error('Erro salvando no Firestore:', err.message || err);
      }
    }

    // Retornar 200 para Mercado Pago
    return res.status(200).json({ ok: true, event: eventType, paymentId });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
};
