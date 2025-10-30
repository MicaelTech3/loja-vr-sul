// /api/createPreference.js
import axios from "axios";

const MP_BASE = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { orderId, items, payer, back_urls } = req.body || {};

    if (!items || !items.length) {
      return res.status(400).json({ error: "Nenhum item informado." });
    }

    // Monta a preferência (checkout)
    const preference = {
      items: items.map(i => ({
        id: i.id,
        title: i.title,
        quantity: Number(i.qty || 1),
        currency_id: "BRL",
        unit_price: Number(i.price || 0),
      })),
      payer: payer || {},
      external_reference: String(orderId || Date.now()),
      back_urls: back_urls || {
        success: `${process.env.PUBLIC_URL}/?status=success`,
        failure: `${process.env.PUBLIC_URL}/?status=failure`,
        pending: `${process.env.PUBLIC_URL}/?status=pending`,
      },
      auto_return: "approved",
      statement_descriptor: "LOJA VR",
      payment_methods: {
        excluded_payment_types: [], // aceita Pix, cartão e boleto
        installments: 12,
      },
    };

    const resp = await axios.post(`${MP_BASE}/checkout/preferences`, preference, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const data = resp.data;
    return res.status(200).json({
      preferenceId: data.id,
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point,
    });
  } catch (err) {
    console.error("Erro createPreference:", err.response?.data || err.message);
    return res.status(500).json({ error: "Erro ao criar preferência" });
  }
}
