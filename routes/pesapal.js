const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const router = express.Router();
const pool = require("../Database/database.js");

dotenv.config();

// Fetch auth token
async function getAccessToken() {
  const { data } = await axios.post("https://pay.pesapal.com/v3/api/Auth/RequestToken", {
    consumer_key: process.env.CONSUMER_KEY,
    consumer_secret: process.env.CONSUMER_SECRET
  });
  return data.token;
}

// Register IPN URL
async function registerIPN(token) {
  const res = await axios.post(
    "https://pay.pesapal.com/v3/api/URLSetup/RegisterIPN",
    {
      url: "https://api.afrikanaccentadventures.com/api/pesapal/callback",
      ipn_notification_type: "GET"
    },
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  console.log("IPN", res.data.ipn_id);
  return res.data.ipn_id;
}

// Check Pesapal payment status
async function checkTransactionStatus(orderTrackingId, token) {
  const { data } = await axios.get(
    `https://pay.pesapal.com/v3/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  return data;
}

// Payment route
router.post("/payment", async (req, res) => {

   const {
      email,
      reference,
      phone,
      first_name,
      last_name,
      amount,
      description
    } = req.body;


  try {
    const token = await getAccessToken();
    const notificationId = await registerIPN(token);
    const orderId = `AAA-${Date.now()}`;

    const billing = {
      email: "user@example.com",
      phone: "254727632051",
      first_name: "James",
      last_name: "Doe"
    };

    const orderData = {
      id: orderId,
      currency: "USD",
      amount: amount,
      description: "Testing",
      callback_url: "https://afrikanaccentadventures.com/contacts", // ✅ frontend callback!
      notification_id: notificationId,
      billing_address: {
        email_address: billing.email,
        phone_number: billing.phone,
        first_name: billing.first_name,
        last_name: billing.last_name
      }
    };

    const response = await axios.post(
      "https://pay.pesapal.com/v3/api/Transactions/SubmitOrderRequest",
      orderData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    await pool.query(
      `INSERT INTO payments (
        reference,
        currency,
        amount,
        description,
        callback_url,
        notification_id,
        email_address,
        phone_number,
        first_name,
        last_name,
        status,
        ip_address,
        email,
        phone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        orderData.currency,
        orderData.amount,
        orderData.description,
        orderData.callback_url,
        notificationId,
        billing.email,
        billing.phone,
        billing.first_name,
        billing.last_name,
        "PENDING",
        req.ip,
        billing.email,
        billing.phone
      ]
    );

    res.json({ redirect_url: response.data.redirect_url });

  } catch (err) {
    const orderId = `TXN-${Date.now()}`;
    const billing = {
      email: req.body?.email || 'user@example.com',
      phone: req.body?.phone || '254727632051',
      first_name: req.body?.first_name || 'James',
      last_name: req.body?.last_name || 'Doe'
    };

    await pool.query(
      `INSERT INTO payments (
        reference,
        currency,
        amount,
        description,
        callback_url,
        notification_id,
        email_address,
        phone_number,
        first_name,
        last_name,
        status,
        ip_address,
        email,
        phone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        "USD",
        0.01,
        "Testing",
        "https://afrikanaccentadventures.com/contacts",
        null,
        billing.email,
        billing.phone,
        billing.first_name,
        billing.last_name,
        "FAILED",
        req.ip,
        billing.email,
        billing.phone
      ]
    );

    console.error("Pesapal Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Server-side callback (Pesapal backend hits this to notify you)
router.get("/callback", async (req, res) => {
  const { OrderTrackingId, OrderMerchantReference } = req.query;
  console.log("Callback received:", OrderTrackingId, OrderMerchantReference);

  try {
    const token = await getAccessToken();
    const statusInfo = await checkTransactionStatus(OrderTrackingId, token);
    const status = statusInfo.payment_status_description;

    console.log(statusInfo)

    await pool.query(
      `UPDATE payments SET status = ? WHERE reference = ?`,
      [status, OrderMerchantReference]
    );

    res.status(200).json({
      message: "Callback processed",
      status: status,
      reference: OrderMerchantReference
    });
  } catch (err) {
    console.error("Failed to update callback status:", err.message);
    res.status(500).json({ error: "Failed to update payment status" });
  }
});

// API endpoint to let frontend check payment status
router.get("/status", async (req, res) => {
  const { trackingId, reference } = req.query;

  try {
    const token = await getAccessToken();
    const statusInfo = await checkTransactionStatus(trackingId, token);

    res.json({
      status: statusInfo.payment_status_description,
      reference: reference
    });
  } catch (err) {
    console.error("Status check failed:", err.message);
    res.status(500).json({ error: "Could not retrieve payment status" });
  }
});

module.exports = router;
