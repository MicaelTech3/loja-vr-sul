// api/createPreference.js (debug-friendly CommonJS)
const axios = require('axios');

const MP_BASE = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || "";

module.exports = async function (req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = req.body || {};
    const { orderId, items, payer, back_urls } = body;

    if (!items || !items.length) {
      return res.status(400).json({ error: "Nenhum item informado." });
    }

    if (!ACCESS_TOKEN) {
      // Não temos token — devolve um fallback (não faz chamada ao MercadoPago)
      return res.status(200).json({
        debug: true,
        message: "MP_ACCESS_TOKEN ausente nas env vars. Endpoint de criação de preferência em modo debug.",
        preferenceId: "DEBUG-" + Date.now(),
        init_point: "https://loja-vr-sul.vercel.app/?mp_result=debug_init_point",
        sandbox_init_point: "https://loja-vr-sul.vercel.app/?mp_result=debug_sandbox"
      });
    }

    // Monta a preferência
    const preference = {
      items: items.map(i => ({
        id: i.id,
        title: i.title,
        quantity: Number(i.qty || 1),
        currency_id: "BRL",
        unit_price: Number(i.price || 0)
      })),
      payer: payer || {},
      external_reference: String(orderId || Date.now()),
      back_urls: back_urls || {
        success: `${process.env.PUBLIC_URL || ""}/?status=success`,
        failure: `${process.env.PUBLIC_URL || ""}/?status=failure`,
        pending: `${process.env.PUBLIC_URL || ""}/?status=pending`
      },
      auto_return: "approved",
      statement_descriptor: "LOJA VR",
      payment_methods: { excluded_payment_types: [], installments: 12 }
    };

    // Faz a chamada ao Mercado Pago
    const resp = await axios.post(`${MP_BASE}/checkout/preferences`, preference, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    });

    const data = resp.data || {};
    return res.status(200).json({
      preferenceId: data.id,
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point
    });
  } catch (err) {
    console.error("createPreference erro:", err.response?.data || err.message || err);
    // retorna detalhe do erro (útil no cliente para debugar)
    return res.status(500).json({
      error: "Erro interno createPreference",
      detail: err.response?.data || err.message || String(err)
    });
  }
};
