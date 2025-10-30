/**
 * Webhook Mercado Pago + Firestore + Telegram
 * Ambiente: Node.js Serverless (Vercel)
 */

const axios = require("axios");
const admin = require("firebase-admin");

// --- Inicializa Firebase Admin ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const db = admin.firestore();

module.exports = async (req, res) => {
  try {
    // 🔹 Recebe corpo da requisição (Webhook)
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    console.log("Webhook recebido:", body);

    // 🔹 Extrai dados principais
    const action = body.action || body.type || "";
    let paymentId = null;

    if (body.data && body.data.id) paymentId = body.data.id;
    if (body.id && !paymentId) paymentId = body.id;

    // 🔹 Filtra apenas pagamentos
    if (!action.includes("payment") && body.topic !== "payment") {
      return res.status(200).send("Ignorado (não é pagamento)");
    }

    // 🔹 Busca detalhes do pagamento via API Mercado Pago
    const MP_ACCESS = process.env.MP_ACCESS_TOKEN;
    if (!MP_ACCESS) {
      console.error("❌ MP_ACCESS_TOKEN não configurado no ambiente!");
      return res.status(500).send("Erro interno: falta Access Token");
    }

    let paymentData = null;
    try {
      const r = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS}` },
      });
      paymentData = r.data;
    } catch (e) {
      console.error("Erro ao buscar detalhes do pagamento:", e.response?.data || e.message);
    }

    // 🔹 Extrai status e infos
    const status = paymentData?.status || "unknown";
    const payerEmail = paymentData?.payer?.email || "-";
    const payerName = paymentData?.payer?.first_name || "";
    const payerPhone = paymentData?.payer?.phone?.number || "-";
    const transactionAmount = paymentData?.transaction_amount || 0;
    const description = paymentData?.description || "Pedido";
    const orderRef = paymentData?.external_reference || paymentId;

    console.log(`Status recebido: ${status} | Pedido: ${orderRef}`);

    // 🔹 Atualiza no Firestore (se pedido existir)
    if (orderRef) {
      const orderRefDoc = db.collection("pedidos").doc(orderRef);
      await orderRefDoc.set(
        {
          status,
          pagoEm: admin.firestore.FieldValue.serverTimestamp(),
          valor: transactionAmount,
          email: payerEmail,
          telefone: payerPhone,
        },
        { merge: true }
      );
    }

    // 🔹 Envia notificação para Telegram (opcional)
    const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

    if (TG_TOKEN && TG_CHAT && (status === "approved" || status === "paid")) {
      const msg = `
✅ *Nova compra aprovada!*

🧾 Pedido: ${orderRef}
📦 Produto: ${description}
💰 Valor: R$ ${transactionAmount}
👤 Cliente: ${payerName} (${payerEmail})
📞 Telefone: ${payerPhone}

Ver mais em: https://loja-vr-sul.vercel.app/admin/vendas
`;

      await axios.post(`https://api.telegram.org/bot${7990320290}/sendMessage`, {
        chat_id: TG_CHAT,
        text: msg,
        parse_mode: "Markdown",
      });
    }

    // 🔹 Retorna sucesso
    res.status(200).send("OK");
  } catch (err) {
    console.error("Erro no webhook:", err);
    res.status(500).send("Erro interno no webhook");
  }
};
