const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}
const db = admin.firestore();

module.exports = async (req, res) => {
  try {
    const update = req.body;
    const message = update.message || update.edited_message;
    if (!message) return res.status(200).send('No message');

    const text = message.text || '';
    const fromUser = message.from;
    const chatId = message.chat?.id;

    console.log('Mensagem recebida do Telegram:', text);

    // padrão: admin responde "order:ID Mensagem"
    const match = text.match(/^order:([^\s]+)\s+(.+)$/i);
    if (match) {
      const orderId = match[1];
      const replyText = match[2];

      await db.collection('chats').doc(orderId).collection('messages').add({
        from: 'admin',
        text: replyText,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('Mensagem salva no Firestore para pedido:', orderId);
      return res.status(200).send('ok');
    }

    // caso contrário, salva como mensagem geral
    await db.collection('admin_inbox').add({
      text,
      from: fromUser.first_name || 'Admin',
      chatId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).send('ok');
  } catch (err) {
    console.error('Erro Telegram Webhook:', err);
    res.status(500).send('error');
  }
};
