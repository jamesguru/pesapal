const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const router = express.Router();

dotenv.config();

// Fetch auth token
async function getAccessToken() {
  const { data } = await axios.post("https://pay.pesapal.com/v3/api/Auth/RequestToken", {
    consumer_key: process.env.CONSUMER_KEY,
    consumer_secret: process.env.CONSUMER_SECRET
  });
    console.log("TOKEN", data.token)
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

// Submit order
router.post("/payment", async (req, res) => {
  try {
    const token = await getAccessToken();

    // Register IPN if you haven’t already stored one
    const notificationId = await registerIPN(token); // or use hardcoded IPN UUID if registered already

    console.log("Notification", notificationId)

    const orderData = {
      id: `TXN-${Date.now()}`,
      currency: "KES",
      amount: 10,
      description: "Testing",
      callback_url: "https://afrikanaccentadventures.com/api/pesapal/callback",
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

    console.log('Response', response)

    const redirectUrl = response.data.redirect_url;

    console.log("Redirect user to:", redirectUrl);
    res.json({ redirect_url: redirectUrl });

  } catch (err) {
    console.error("Pesapal Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
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
