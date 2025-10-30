// webhook.js
const axios = require("axios");
const admin = require("firebase-admin");
const crypto = require("crypto");

// ---------- CONFIG - use env vars on Vercel (recommended) ----------
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || "APP_USR-1018752691222877-103012-445793c3ad7e9d84d56576424bbbbdd0-2956486419";
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || "a2176ae20863eddef3d8430491fe7f74c0ccf76b5408173d666f8d593599a06f";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8072729661:AAHk27AYT_VavWIRo-mcrmls05GPbUV3XpU"; // fallback
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8431604160"; // fallback
// ------------------------------------------------------------------

// Initialize Firebase Admin (expects GOOGLE_APPLICATION_CREDENTIALS or platform default)
if (!admin.apps.length) {
  admin.initializeApp({
    // In serverless (Vercel) you can set GOOGLE_APPLICATION_CREDENTIALS or use a service account JSON from ENV
    credential: admin.credential.applicationDefault(),
  });
}
const db = admin.firestore();

function safeJsonStringify(v){
  try { return JSON.stringify(v); } catch(e) { return String(v); }
}

module.exports = async (req, res) => {
  try {
    // Accept only POST
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    // Get raw body string (Vercel / serverless sometimes gives req.rawBody)
    const bodyString = (typeof req.rawBody === "string" && req.rawBody.length) ? req.rawBody : safeJsonStringify(req.body);
    const body = typeof req.body === "object" ? req.body : (bodyString ? JSON.parse(bodyString) : {});

    console.log("[WEBHOOK] received body:", body);

    // --- Optional: verify signature if header provided ---
    const signatureHeader = req.headers["x-meli-signature"] || req.headers["x-hub-signature"] || req.headers["x-hook-signature"] || req.headers["x-signature"];
    if (MP_WEBHOOK_SECRET && signatureHeader) {
      // Compute HMAC SHA256 hex
      const hmac = crypto.createHmac("sha256", MP_WEBHOOK_SECRET).update(bodyString).digest("hex");
      const hmacBase64 = crypto.createHmac("sha256", MP_WEBHOOK_SECRET).update(bodyString).digest("base64");

      if (!signatureHeader.includes(hmac) && !signatureHeader.includes(hmacBase64)) {
        console.warn("[WEBHOOK] signature mismatch. header:", signatureHeader, "computedHex:", hmac, "computedB64:", hmacBase64);
        // don't fail hard — log and continue (adjust policy if you want to reject)
        // return res.status(401).send("Invalid signature");
      } else {
        console.log("[WEBHOOK] signature verified.");
      }
    } else {
      console.log("[WEBHOOK] no signature header or secret configured. skipping verification.");
    }

    // Determine event type & payment id
    const action = body.action || body.type || body.topic || "";
    let paymentId = null;
    if (body.data && body.data.id) paymentId = body.data.id;
    if (body.id && !paymentId) paymentId = body.id;
    if (body?.payment?.id && !paymentId) paymentId = body.payment.id;

    // If not a payment notification, respond ok
    if (!action.toString().toLowerCase().includes("payment") && (body.topic && body.topic !== "payment")) {
      console.log("[WEBHOOK] Not a payment event. action/topic:", action || body.topic);
      return res.status(200).send("ignored");
    }

    if (!paymentId) {
      console.warn("[WEBHOOK] No payment id found in payload. body:", body);
      // still ack to MP
      return res.status(200).send("no-payment-id");
    }

    // Fetch payment details from Mercado Pago
    let paymentData = null;
    try {
      const r = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
        timeout: 10000,
      });
      paymentData = r.data;
      console.log("[WEBHOOK] payment data fetched:", paymentData.id, paymentData.status);
    } catch (err) {
      console.error("[WEBHOOK] error fetching payment:", err.response?.data || err.message);
      // still ack so MP won't retry too often; but you can return 500 to force retry
      return res.status(200).send("error-fetching-payment");
    }

    // Extract relevant fields
    const status = (paymentData.status || "").toString().toLowerCase(); // ex: approved, pending, rejected
    const payerEmail = paymentData.payer?.email || "-";
    const payerName = [paymentData.payer?.first_name, paymentData.payer?.last_name].filter(Boolean).join(" ") || "-";
    const payerPhone = paymentData.payer?.phone?.number || paymentData.payer?.phone?.area_code || "-";
    const transactionAmount = paymentData.transaction_amount || paymentData.total_paid_amount || 0;
    const externalRef = paymentData.external_reference || paymentData.additional_info?.items?.[0]?.id || null;
    const description = paymentData.description || (paymentData.additional_info?.items?.map(i=>i.title).join(", ") || "Pedido");

    // Determine order doc id (prefer external_reference as you used when creating preference)
    const orderDocId = externalRef || String(paymentData.id);

    // Update Firestore order
    try {
      const docRef = db.collection("pedidos").doc(orderDocId);
      await docRef.set({
        status,
        pagoEm: admin.firestore.FieldValue.serverTimestamp(),
        valor: transactionAmount,
        email: payerEmail,
        telefone: payerPhone,
        mp_payment_id: paymentData.id,
        mp_status: paymentData.status,
        raw: paymentData,
      }, { merge: true });
      console.log("[WEBHOOK] Firestore updated for order:", orderDocId);
    } catch (err) {
      console.error("[WEBHOOK] Firestore error:", err);
    }

    // Send Telegram notification if approved/paid
    if (["approved","paid"].includes(status)) {
      try {
        const text = [
          "✅ *Compra aprovada!*",
          `*Pedido:* ${orderDocId}`,
          `*Produto:* ${description}`,
          `*Valor:* R$ ${Number(transactionAmount).toFixed(2)}`,
          `*Cliente:* ${payerName} (${payerEmail})`,
          `*Telefone:* ${payerPhone}`,
          ``,
          `Ver detalhes: https://loja-vr-sul.vercel.app/admin/vendas`
        ].join("\n");

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true
        }, { timeout: 10000 });

        console.log("[WEBHOOK] Telegram notification sent.");
      } catch (err) {
        console.error("[WEBHOOK] Telegram send error:", err.response?.data || err.message);
      }
    } else {
      console.log("[WEBHOOK] Payment status is", status, "— no telegram sent.");
    }

    // Reply 200 OK to Mercado Pago
    return res.status(200).send("OK");
  } catch (err) {
    console.error("[WEBHOOK] unexpected error:", err);
    return res.status(500).send("internal error");
  }
};
