// api/createPreference.js
const axios = require('axios');

const MP_BASE = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || "";
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.PUBLIC_URL || process.env.NEXT_PUBLIC_PUBLIC_URL || "";

module.exports = async function (req, res) {
  // CORS básico (ajuste se precisar restringir)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = req.body || {};
    const { orderId, items, payer, back_urls } = body;

    if (!items || !items.length) {
      return res.status(400).json({ error: "Nenhum item informado." });
    }

    // Se não tem token, responde modo debug (útil localmente / em plano grátis)
    if (!ACCESS_TOKEN) {
      return res.status(200).json({
        debug: true,
        message: "MP_ACCESS_TOKEN ausente nas env vars. Endpoint de criação de preferência em modo debug.",
        preferenceId: "DEBUG-" + Date.now(),
        init_point: (PUBLIC_URL ? PUBLIC_URL : "https://loja-vr-sul.vercel.app") + "/?mp_result=debug_init_point",
        sandbox_init_point: (PUBLIC_URL ? PUBLIC_URL : "https://loja-vr-sul.vercel.app") + "/?mp_result=debug_sandbox"
      });
    }

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
        success: `${PUBLIC_URL}/?status=success`,
        failure: `${PUBLIC_URL}/?status=failure`,
        pending: `${PUBLIC_URL}/?status=pending`
      },
      auto_return: "approved",
      statement_descriptor: "LOJA VR",
      payment_methods: { excluded_payment_types: [], installments: 12 }
    };

    const resp = await axios.post(`${MP_BASE}/checkout/preferences`, preference, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 15000
    });

    const data = resp.data || {};
    return res.status(200).json({
      preferenceId: data.id,
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point
    });
  } catch (err) {
    console.error("createPreference erro:", err.response?.data || err.message || err);
    return res.status(500).json({
      error: "Erro interno createPreference",
      detail: err.response?.data || err.message || String(err)
    });
  }
};
