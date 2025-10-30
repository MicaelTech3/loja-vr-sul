// api/webhook.js
const axios = require('axios');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const db = admin.firestore();

const WA_TOKEN = process.env.WA_TOKEN;
const WA_PHONE_ID = process.env.WA_PHONE_ID;
const OWNER_WA_NUMBER = process.env.OWNER_WA_NUMBER; // ex: 5549997124880
const MP_TOKEN = process.env.MP_ACCESS_TOKEN;

module.exports = async (req, res) => {
  try {
    // Mercado Pago envia diferentes formatos; a forma comum:
    // pergunta: se vem {action: 'payment.updated', data: {id: 'PAYMENT_ID'}} ou query params
    const body = req.body || {};
    console.log('Webhook incoming', JSON.stringify(body).slice(0,300));

    // Exemplo: pegar payment id
    let paymentId = null;
    if (body.type === 'payment' && body.data && body.data.id) paymentId = body.data.id;
    if (body.action === 'payment.updated' && body.data && body.data.id) paymentId = body.data.id;
    // Em alguns casos vem query: req.query['id']
    if (!paymentId && req.query && req.query.id) paymentId = req.query.id;

    if (!paymentId) {
      // Alguns webhooks do MP enviam resource id em body.resource.id ou semelhante.
      console.warn('No payment id found in webhook', Object.keys(req.body));
      return res.status(200).send('ok'); // responde 200 para evitar retries abusivos
    }

    // Buscar dados do pagamento na API do Mercado Pago
    const mpResp = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` }
    });
    const payment = mpResp.data;
    console.log('Payment details', payment.status, payment.additional_info?.items);

    // A API de payment costuma trazer external_reference em order ou em collection?
    // Vamos tentar extrair external_reference:
    let externalRef = payment.external_reference || payment.order?.external_reference;
    // Se não vier, tentar em additional_info.items?
    if (!externalRef && payment.additional_info && payment.additional_info.items && payment.additional_info.items.length) {
      externalRef = payment.additional_info.items[0].id || payment.additional_info.items[0].external_reference;
    }

    // Se nada -> log e responde ok
    if (!externalRef) {
      console.warn('No external reference to correlate order', paymentId);
      return res.status(200).send('ok');
    }

    const orderRef = db.collection('orders').doc(externalRef);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      console.warn('Order not found', externalRef);
      // opcional: criar order
      await orderRef.set({
        externalPaymentId: paymentId,
        status: payment.status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } else {
      // Atualiza pedido
      await orderRef.set({
        status: payment.status, // ex: approved
        paymentId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    // Se pagamento aprovado -> enviar notificação WhatsApp para owner
    if (payment.status === 'approved') {
      // Busca dados do pedido para montar mensagem
      const orderData = (await orderRef.get()).data() || {};
      const total = payment.transaction_amount || orderData.total || 0;
      const payer = payment.payer || orderData.payer || {};
      const email = payer.email || orderData.payer?.email || '';
      const phone = payer.phone?.number || orderData.payer?.phone || '';
      const items = (payment.additional_info?.items || orderData.items || []).map(it => `${it.title || it.name} x${it.quantity || 1}`).join(', ');
      const msg = `Novo pedido recebido\nItens: ${items}\nValor: R$ ${total}\nOrder ID: ${externalRef}\nEmail: ${email}\nTelefone: ${phone}\nStatus: Pago\nAdmin: ${process.env.PUBLIC_URL || ''}/admin/minhas-vendas?order=${externalRef}`;

      // Envia WhatsApp (WhatsApp Cloud API)
      if (WA_TOKEN && WA_PHONE_ID && OWNER_WA_NUMBER) {
        try {
          await axios.post(`https://graph.facebook.com/v17.0/${WA_PHONE_ID}/messages`, {
            messaging_product: "whatsapp",
            to: OWNER_WA_NUMBER,
            type: "text",
            text: { body: msg }
          }, {
            headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' }
          });
          console.log('WhatsApp sent to owner');
        } catch (waErr) {
          console.error('WhatsApp error', waErr.response?.data || waErr.message);
        }
      } else {
        console.log('WA not configured, skipping WhatsApp send.');
      }
    }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('webhook error', err.response?.data || err.message || err);
    return res.status(500).send('error');
  }
};
