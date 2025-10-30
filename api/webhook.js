// /api/webhook.js
const axios = require("axios");

module.exports = async function (req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const evento = req.body;

    console.log("🔔 Webhook recebido:", JSON.stringify(evento, null, 2));

    // Confirma se é notificação de pagamento
    if (evento.type === "payment" || evento.topic === "payment") {
      const paymentId = evento.data?.id || evento.data?.payment_id;
      console.log("🧾 Consultando pagamento:", paymentId);

      if (paymentId) {
        const resp = await axios.get(
          `https://api.mercadopago.com/v1/payments/${paymentId}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
            },
          }
        );

        const pagamento = resp.data;
        console.log("📦 Status do pagamento:", pagamento.status);

        // 👉 Aqui você pode salvar no Firebase Firestore:
        // await setDoc(doc(db, "pedidos", String(paymentId)), pagamento);

        return res.status(200).json({
          success: true,
          id: paymentId,
          status: pagamento.status,
        });
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Erro no webhook:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
