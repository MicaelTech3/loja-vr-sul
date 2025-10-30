// api/webhook.js
const axios = require('axios');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}
const db = admin.firestore();

module.exports = async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    console.log('MP webhook:', body);

    // pega id do pagamento
    let paymentId = body.data?.id || body.id || null;
    const topic = body.type || body.action || body.topic || '';

    if (!String(topic).includes('payment') && body.topic !== 'payment') {
      return res.status(200).send('ignored');
    }
    if (!paymentId) {
      console.warn('no payment id');
      return res.status(200).send('no payment id');
    }

    const MP_ACCESS = process.env.MP_ACCESS_TOKEN;
    if (!MP_ACCESS) return res.status(500).send('no mp token');

    // busca pagamento
    let pay;
    try {
      const r = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS}` }
      });
      pay = r.data;
    } catch (err) {
      console.error('mp get payment error', err.response?.data || err.message);
      return res.status(200).send('mp fetch error');
    }

    // extrai dados
    const status = pay.status; // approved, pending, cancelled...
    const externalRef = pay.external_reference || `mp-${paymentId}`;
    const amount = pay.transaction_amount || pay.total_amount || 0;
    const payerEmail = pay.payer?.email || '-';
    const payerName = `${pay.payer?.first_name || ''} ${pay.payer?.last_name || ''}`.trim();
    const payerPhone = pay.payer?.phone?.number || '-';
    const items = pay.additional_info?.items || pay.order?.items || [];

    // Salva ou atualiza pedido
    const docRef = db.collection('pedidos').doc(String(externalRef));
    await docRef.set({
      orderId: String(externalRef),
      status,
      valor: amount,
      email: payerEmail,
      telefone: payerPhone,
      clienteNome: payerName,
      items,
      pagoEm: status === 'approved' ? admin.firestore.FieldValue.serverTimestamp() : null,
      raw: pay
    }, { merge: true });

    // Cria mensagem automática no chat
    const chatRef = db.collection('chats').doc(String(externalRef));
    const msgRef = chatRef.collection('messages').doc();
    await msgRef.set({
      from: 'system',
      text: `Pagamento recebido: status=${status}, valor=${amount}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Notifica no Telegram se aprovado
    const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TG_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (TG_TOKEN && TG_CHAT && status === 'approved') {
      const text = [
        '✅ *Nova compra aprovada*',
        `Pedido: ${externalRef}`,
        `Valor: R$ ${amount}`,
        `Cliente: ${payerName} (${payerEmail})`,
        `Telefone: ${payerPhone}`,
        `Ver pedido: ${process.env.PUBLIC_URL}/admin/vendas`
      ].join('\n');

      try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
          chat_id: TG_CHAT,
          text,
          parse_mode: 'Markdown'
        });
      } catch (e) {
        console.error('telegram send error', e.response?.data || e.message);
      }
    }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('webhook error', err);
    return res.status(500).send('error');
  }
};
