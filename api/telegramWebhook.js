// api/telegramWebhook.js
const axios = require('axios');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

module.exports = async (req, res) => {
  try {
    const update = req.body;
    // possible update.message or update.edited_message etc.
    const message = update.message || update.edited_message;
    if (!message) return res.status(200).send('no message');

    const text = message.text || '';
    const from = message.from;
    const chatId = message.chat?.id;

    // ADMIN sends a response like: "/reply orderId texto..." or "order:{orderId} texto..."
    // We'll support simple format: "order:ORDERID your reply here"
    const regex = /^order:([^\s]+)\s+(.+)$/i;
    const match = text.match(regex);

    if (match) {
      const orderId = match[1];
      const replyText = match[2];

      // save in chat
      const chatRef = db.collection('chats').doc(String(orderId));
      const msgRef = chatRef.collection('messages').doc();
      await msgRef.set({
        from: 'admin/telegram',
        text: replyText,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        telegram: { chatId, userId: from.id }
      });

      // optionally send ack to admin
      return res.status(200).send('ok');
    }

    // if message is not order reply, store as admin general message or ignore
    // store in 'admin_inbox' or similar
    const inboxRef = db.collection('admin_messages').doc();
    await inboxRef.set({
      from: 'telegram',
      text,
      fromUser: { id: from.id, name: `${from.first_name||''} ${from.last_name||''}` },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).send('ok');
  } catch (err) {
    console.error('telegram webhook error', err);
    return res.status(500).send('error');
  }
};
