const express = require("express");
const dotenv = require("dotenv");
const axios = require("axios");

dotenv.config();
const router = express.Router();

const BASE_URL = "https://pay.pesapal.com/v3"; // Change to sandbox.pesapal.com for testing
let cachedNotificationId = process.env.PESAPAL_NOTIFICATION_ID || null;

// Step 1: Get OAuth Token
async function getAccessToken() {
  const url = `${BASE_URL}/api/Auth/RequestToken`;
  const credentials = {
    consumer_key: process.env.CONSUMER_KEY,
    consumer_secret: process.env.CONSUMER_SECRET,
  };

  const res = await axios.post(url, credentials);
  console.log(res.data)
  return res.data.token;
}

// Step 2: Register IPN Callback (if not already done)
async function registerIPNUrl(token) {
  if (cachedNotificationId) return cachedNotificationId;

  const url = `${BASE_URL}/api/URLSetup/RegisterIPN`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const data = {
    url: "https://afrikanaccentadventures.com/api/pesapal/ipn", // ⛔ Replace with your actual public IPN URL
    ipn_notification_type: "GET",
  };

  const res = await axios.post(url, data, { headers });
  cachedNotificationId = res.data.notification_id;
  return cachedNotificationId;
}

// Step 3: Submit Payment Request
router.post("/payment", async (req, res) => {
  try {
    const token = await getAccessToken();
    const notificationId = await registerIPNUrl(token);

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const orderData = {
      currency: "KES",
      amount: 10.00,
      description: "Testing",
      callback_url: "https://afrikanaccentadventures.com/api/pesapal/callback", // Change to live callback URL in production
      notification_id: notificationId,
      billing_address: {
        email_address: "user@example.com",
        phone_number: "254727632051",
        first_name: "James",
        last_name: "Doe",
      },
    };

    const response = await axios.post(
      `${BASE_URL}/api/Transactions/SubmitOrderRequest`,
      orderData,
      { headers }
    );

    console.log("Response", response)
    const redirectUrl = response.data.redirect_url;
    console.log("Redirect user to:", redirectUrl);
    res.status(200).json({ payment_url: redirectUrl });

  } catch (err) {
    console.error("Pesapal Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to initiate payment" });
  }
});

// Step 4: Callback route (after payment)
router.get("/callback", async (req, res) => {
  res.status(200).json({ success: "Payment callback received" });
});

// Optional IPN listener endpoint
router.get("/ipn", async (req, res) => {
  console.log("IPN received:", req.query);
  res.status(200).json({ received: true });
});

module.exports = router;
