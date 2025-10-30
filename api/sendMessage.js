// api/sendMessage.js
const axios = require('axios');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

module.exports = async (req, res) => {
  try {
    const body = req.body;
    // body: { orderId, from: 'cliente', text }
    if (!body || !body.orderId || !body.text) return res.status(400).send({ error: 'missing' });

    const orderId = String(body.orderId);
    const chatRef = db.collection('chats').doc(orderId);
    const msgRef = chatRef.collection('messages').doc();
    await msgRef.set({
      from: body.from || 'cliente',
      text: body.text,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // opcional: também gravar em pedidos
    await db.collection('pedidos').doc(orderId).set({ lastMessageAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    // envia para Telegram (administrador)
    const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TG_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (TG_TOKEN && TG_CHAT) {
      const text = `💬 *Mensagem do cliente*\nPedido: ${orderId}\n\n${body.text}\n\nResponder: ${process.env.PUBLIC_URL}/admin/vendas`;
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

    return res.status(200).send({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ error: 'internal' });
  }
};
