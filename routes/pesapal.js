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
      url: "https://afrikanaccentadventures.com/api/pesapal/callback",
      ipn_notification_type: "GET" // or "POST" based on how your endpoint handles it
    },
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  console.log("IPN", res.data.ipn_id)

  return res.data.ipn_id;
}


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


// Submit order
router.post("/payment", async (req, res) => {
  try {
    const token = await getAccessToken();

    // Register IPN if you haven’t already stored one
    const notificationId = await registerIPN(token); // or use hardcoded IPN UUID if registered already

    const orderId = `TXN-${Date.now()}`; // Generate reference

    const orderData = {
      id: orderId,
      currency: "USD",
      amount: 0.01,
      description: "Testing",
      callback_url: "https://api.afrikanaccentadventures.com/api/pesapal/callback",
      notification_id: notificationId,
      billing_address: {
        email_address: "user@example.com",
        phone_number: "254727632051",
        first_name: "James",
        last_name: "Doe"
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

    console.log("IP ADDRESS", req.ip)

    // Store order in DB before redirect
    await pool.query(
      `INSERT INTO payments (reference, currency, amount, description, email, phone, first_name, last_name, notification_id, ip_address,status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        orderData.currency,
        orderData.amount,
        orderData.description,
        orderData.billing_address.email_address,
        orderData.billing_address.phone_number,
        orderData.billing_address.first_name,
        orderData.billing_address.last_name,
        notificationId,
        req.ip,
        "PENDING"
      ]
    );


    const redirectUrl = response.data.redirect_url;



    res.json({ redirect_url: redirectUrl });

  } catch (err) {

    const orderId = `TXN-${Date.now()}`;
    const billing = {
      email: req.body?.email || 'user@example.com',
      phone: req.body?.phone || '254727632051',
      first_name: req.body?.first_name || 'James',
      last_name: req.body?.last_name || 'Doe'
    };

    // Log failed attempt to DB
    await pool.query(
      `INSERT INTO payments (reference, currency, amount, description, email, phone, first_name, last_name, status,ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        "USD",
        0.01,
        "Testing",
        billing.email,
        billing.phone,
        billing.first_name,
        billing.last_name,
        "FAILED",
        req.ip
      ]
    );

    console.error("Pesapal Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Step 4: Callback route (after payment)
router.get("/callback", async (req, res) => {
  const { OrderTrackingId, OrderMerchantReference } = req.query;

  console.log("Callback received:", OrderTrackingId, OrderMerchantReference);

  try {
    const token = await getAccessToken();
    const statusInfo = await checkTransactionStatus(OrderTrackingId, token);
    console.log("STATUS INFO IN CALLBACK", statusInfo)
    const status = statusInfo.payment_status.toLowerCase(); // e.g., COMPLETED, FAILED, INVALID, etc.

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


// Optional IPN listener endpoint
router.get("/ipn", async (req, res) => {
  res.status(200).json({ received: true });
});




module.exports = router;
