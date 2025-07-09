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

  const token = await getAccessToken();
  const notificationId = await registerIPN(token);
  const {
    email,
    phone,
    first_name,
    reference,
    last_name,
    amount,
    description
  } = req.body;

  const currency = "USD";

  const billing = {
    email: email || "user@example.com",
    phone: phone || "254727632051",
    first_name: first_name || "James",
    last_name: last_name || "Doe"
  };

  const callbackUrl = "https://afrikanaccentadventures.com/contacts";


  const orderData = {
    id: reference,
    currency,
    amount,
    description,
    callback_url: callbackUrl,
    notification_id: notificationId, // set later after getting notificationId
    billing_address: {
      email_address: billing.email,
      phone_number: billing.phone,
      first_name: billing.first_name,
      last_name: billing.last_name
    }
  };

  try {
    

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
        reference,
        orderData.currency,
        orderData.amount,
        orderData.description,
        orderData.callback_url,
        orderData.notification_id,
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
        reference,
        orderData.currency,
        orderData.amount,
        orderData.description,
        orderData.callback_url,
        notificationId,
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

  try {
    const token = await getAccessToken();
    const statusInfo = await checkTransactionStatus(OrderTrackingId, token);
    const status = statusInfo.payment_status_description.toUpperCase();
    let action = statusInfo.payment_status_code;

    if (!action) {
      action = "accepted"
    }

    await pool.query(
      `UPDATE payments SET status = ?, action = ? WHERE reference = ?`,
      [status, action, OrderMerchantReference]
    );


    // Update bookings table (set status to 4)
    await pool.query(
      `UPDATE bookings SET status = 4 WHERE booking_ref = ?`,
      [OrderMerchantReference]
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
