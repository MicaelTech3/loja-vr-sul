// api/webhook.js
import fetch from 'node-fetch';
import admin from 'firebase-admin';

const MP_TOKEN = process.env.MP_ACCESS_TOKEN; // Mercado Pago access token
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN; // Telegram bot token
const TG_CHAT = process.env.TELEGRAM_CHAT_ID; // seu numero/chat id
const FIREBASE_SA = process.env.FIREBASE_SERVICE_ACCOUNT; // JSON string

// inicializa Firebase Admin (apenas uma vez)
if(!admin.apps.length){
  const sa = FIREBASE_SA ? JSON.parse(FIREBASE_SA) : null;
  admin.initializeApp({
    credential: sa ? admin.credential.cert(sa) : admin.credential.applicationDefault()
  });
}
const db = admin.firestore();

async function sendTelegram(text){
  if(!TG_TOKEN || !TG_CHAT) return;
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  try{
    await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML' })
    });
  }catch(e){ console.error('Erro Telegram', e); }
}

export default async function handler(req, res){
  // Mercado Pago webhooks geralmente chegam como POST com body:
  // { type: 'payment', data: { id: 'PAYMENT_ID' }, ... }
  try{
    const evt = req.body || {};
    // log curto
    console.log('MP Webhook received', evt.type || evt);
    // só tratamos pagamentos
    if(evt.type !== 'payment' && evt.type !== 'merchant_order' && !(evt.data && evt.data.id)) {
      return res.status(200).send('Ignored');
    }
    // extrair id do pagamento
    const mpId = (evt.data && evt.data.id) || (evt.id) || null;
    if(!mpId) return res.status(200).send('No id');

    // chamar Mercado Pago para pegar detalhes do payment
    const mpUrl = `https://api.mercadopago.com/v1/payments/${mpId}`;
    const mpResp = await fetch(mpUrl, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` }
    });
    if(!mpResp.ok){
      console.error('MP fetch failed', await mpResp.text());
      return res.status(500).send('MP fetch failed');
    }
    const payment = await mpResp.json();
    console.log('Payment', payment.status, payment);

    // montar dados do pedido
    const status = payment.status; // "approved" quando pago
    const externalRef = payment.external_reference || payment.order ? payment.order.id : null;
    const payer = payment.payer || {};
    const items = (payment.additional_info && payment.additional_info.items) || [];
    const total = payment.transaction_amount || payment.total_paid_amount || payment.amount || 0;

    // Atualizar Firestore: procurar pedido por orderId ou criar
    // Vamos usar external_reference (você deve salvar orderId como external_reference ao criar preferência)
    let orderDocRef = null;
    if(externalRef){
      const q = await db.collection('pedidos').where('orderId','==', externalRef).limit(1).get();
      if(!q.empty) orderDocRef = q.docs[0].ref;
    }
    if(!orderDocRef){
      // fallback: cria novo doc com id do mp
      orderDocRef = db.collection('pedidos').doc(mpId);
      await orderDocRef.set({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentId: mpId,
        orderId: externalRef || null,
        payer: { email: payer.email || null, phone: payer.phone || null, ...payer },
        items,
        total,
        status
      }, { merge:true });
    } else {
      await orderDocRef.set({
        status,
        paymentId: mpId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        total,
        payer: { email: payer.email || null, phone: payer.phone || null }
      }, { merge:true });
    }

    // Se pagamento aprovado -> notifica telegram e (opcional) envia WhatsApp pelo CallMeBot
    if(status === 'approved'){
      // montar mensagem legível
      let msg = `✅ <b>Compra concluída</b>\n`;
      msg += `Pedido: ${externalRef || mpId}\n`;
      msg += `Valor: R$ ${Number(total).toFixed(2)}\n`;
      if(payer.email) msg += `E-mail: ${payer.email}\n`;
      if(payer.phone && payer.phone.number) msg += `Telefone: ${payer.phone.area_code || ''}${payer.phone.number}\n`;
      if(items && items.length){
        msg += `Itens:\n`;
        items.forEach(it => msg += ` • ${it.title || it.id} — ${it.quantity||1} x R$ ${Number(it.unit_price||it.price||0).toFixed(2)}\n`);
      }
      msg += `\nLink Admin: https://seu-admin-url.com/minhas-vendas?order=${externalRef || mpId}`;

      await sendTelegram(msg);

      // optionally also send to CallMeBot (WHATSAPP) if you prefer:
      // if(process.env.CALLMEBOT_KEY && process.env.CALLMEBOT_PHONE) {
      //   const callUrl = `https://api.callmebot.com/whatsapp.php?phone=${process.env.CALLMEBOT_PHONE}&text=${encodeURIComponent(msg)}&apikey=${process.env.CALLMEBOT_KEY}`;
      //   await fetch(callUrl);
      // }
    }

    return res.status(200).send('ok');
  }catch(err){
    console.error('Webhook handler error', err);
    return res.status(500).send('error');
  }
}
