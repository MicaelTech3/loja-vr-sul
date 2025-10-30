/**
 * Webhook Mercado Pago + Firestore + Telegram
 * Ambiente: Node.js (Vercel)
 */

const axios = require("axios");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const db = admin.firestore();

module.exports = async (req, res) => {
  try {
    // 🔹 Recebe corpo da requisição
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    console.log("Webhook recebido:", body);

    // 🔹 Extrai o ID do pagamento
    const action = body.action || body.type || "";
    let paymentId = null;
    if (body.data && body.data.id) paymentId = body.data.id;
    if (body.id && !paymentId) paymentId = body.id;

    // 🔹 Ignora se não for pagamento
    if (!action.includes("payment") && body.topic !== "payment") {
      return res.status(200).send("Ignorado (não é pagamento)");
    }

    // 🔹 Acesso Mercado Pago
    const MP_ACCESS_TOKEN = "APP_USR-1018752691222877-103012-445793c3ad7e9d84d56576424bbbbdd0-2956486419";
    if (!MP_ACCESS_TOKEN) {
      console.error("❌ Access token não configurado");
      return res.status(500).send("Falta Access Token");
    }

    // 🔹 Busca detalhes do pagamento
    let paymentData = null;
    try {
      const r = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      paymentData = r.data;
    } catch (e) {
      console.error("Erro ao buscar pagamento:", e.response?.data || e.message);
      return res.status(500).send("Erro ao consultar pagamento");
    }

    // 🔹 Extrai dados
    const status = paymentData?.status || "unknown";
    const payerEmail = paymentData?.payer?.email || "-";
    const payerName = paymentData?.payer?.first_name || "";
    const payerPhone = paymentData?.payer?.phone?.number || "-";
    const transactionAmount = paymentData?.transaction_amount || 0;
    const description = paymentData?.description || "Pedido";
    const orderRef = paymentData?.external_reference || paymentId;

    console.log(`Pagamento ${paymentId}: ${status}`);

    // 🔹 Atualiza no Firestore
    if (orderRef) {
      const ref = db.collection("pedidos").doc(orderRef.toString());
      await ref.set(
        {
          status,
          pagoEm: admin.firestore.FieldValue.serverTimestamp(),
          valor: transactionAmount,
          email: payerEmail,
          telefone: payerPhone,
          nome: payerName,
          produto: description,
        },
        { merge: true }
      );
    }

    // 🔹 Envia mensagem no Telegram
    const TELEGRAM_TOKEN = "7990320290:AAHltqfWhAnulHK5sqFxVMkhbT-bPtZPTyE";
    const TELEGRAM_CHAT_ID = "SEU_CHAT_ID_AQUI"; // 👈 substitua depois pelo seu chat_id (veja instruções abaixo)

    if (status === "approved" || status === "paid") {
      const msg = `
✅ *Nova compra confirmada!*

🧾 Pedido: ${orderRef}
📦 Produto: ${description}
💰 Valor: R$ ${transactionAmount.toFixed(2)}
👤 Cliente: ${payerName}
📧 Email: ${payerEmail}
📞 Telefone: ${payerPhone}

🕓 Status: ${status.toUpperCase()}

Ver mais: https://loja-vr-sul.vercel.app/admin/vendas
`;

      try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          chat_id: TELEGRAM_CHAT_ID,
          text: msg,
          parse_mode: "Markdown",
        });
        console.log("📩 Notificação enviada ao Telegram com sucesso!");
      } catch (err) {
        console.error("❌ Erro ao enviar Telegram:", err.response?.data || err.message);
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Erro no webhook:", err);
    res.status(500).send("Erro interno no webhook");
  }
};
