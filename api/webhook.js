// webhook.js
const axios = require("axios");
const admin = require("firebase-admin");

// Init Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}
const db = admin.firestore();

module.exports = async (req, res) => {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    console.log("Webhook recebido:", JSON.stringify(body).slice(0,2000));

    const action = body.action || body.type || "";
    let paymentId = null;
    if (body.data && body.data.id) paymentId = body.data.id;
    if (body.id && !paymentId) paymentId = body.id;

    if (!action.includes("payment") && body.topic !== "payment") {
      console.log("Ignorado: não é pagamento");
      return res.status(200).send("Ignorado");
    }

    const MP_ACCESS = process.env.MP_ACCESS_TOKEN;
    if (!MP_ACCESS) {
      console.error("Falta MP_ACCESS_TOKEN nas env vars");
      return res.status(500).send("Falta MP_ACCESS_TOKEN");
    }

    // busca dados do pagamento
    let paymentData = null;
    try {
      const r = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS}` }
      });
      paymentData = r.data;
    } catch (err) {
      console.error("Erro buscando pagamento:", err.response?.data || err.message);
      // não falha 500 para o Mercado Pago — apenas log e responde 200 (p/ evitar retries)
      return res.status(200).send("Erro ao buscar pagamento, log gravado");
    }

    const status = paymentData?.status || "unknown";
    const payerEmail = paymentData?.payer?.email || "-";
    const payerName = (paymentData?.payer?.first_name || "") + " " + (paymentData?.payer?.last_name || "");
    const payerPhone = paymentData?.payer?.phone?.number || "-";
    const transactionAmount = paymentData?.transaction_amount || paymentData?.transaction_amount || 0;
    const description = paymentData?.description || paymentData?.statement_descriptor || "Pedido";
    const orderRef = paymentData?.external_reference || paymentData?.order?.id || paymentId;

    console.log(`Pagamento ${paymentId} status=${status} orderRef=${orderRef}`);

    // atualiza Firestore (merge)
    if (orderRef) {
      await db.collection("pedidos").doc(String(orderRef)).set({
        status,
        pagoEm: admin.firestore.FieldValue.serverTimestamp(),
        valor: transactionAmount,
        email: payerEmail,
        telefone: payerPhone,
        raw_payment: paymentData
      }, { merge: true });
    }

    // envia mensagem Telegram se aprovado
    const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

    if (TG_TOKEN && TG_CHAT && (status === "approved" || status === "paid" || status === "authorized")) {
      const msg = [
        "✅ Nova compra aprovada!",
        `🧾 Pedido: ${orderRef}`,
        `📦 Produto: ${description}`,
        `💰 Valor: R$ ${transactionAmount}`,
        `👤 Cliente: ${payerName} (${payerEmail})`,
        `📞 Telefone: ${payerPhone}`,
        `Ver: https://loja-vr-sul.vercel.app/admin/vendas`
      ].join("\n");

      try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
          chat_id: TG_CHAT,
          text: msg
        }, { timeout: 8000 });
        console.log("Mensagem Telegram enviada");
      } catch (err) {
        console.error("Falha ao enviar Telegram:", err.response?.data || err.message);
      }
    } else {
      console.log("Telegram não configurado ou status não é aprovado:", { TG_TOKEN: !!TG_TOKEN, TG_CHAT: !!TG_CHAT, status });
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Erro geral webhook:", err);
    return res.status(500).send("Erro interno");
  }
};
