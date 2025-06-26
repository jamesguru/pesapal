const express = require("express");
const router = express.Router();
const dotenv = require("dotenv");
dotenv.config();

const pesapal = require("pesapaljs-v3").init({
  key: process.env.PESAPAL_CONSUMER_KEY,
  secret: process.env.PESAPAL_CONSUMER_SECRET,
  debug: false,
});

let ipnId; // We’ll store this after registering once

// Authenticate and Register IPN once on server startup
(async () => {
  await pesapal.authenticate();

  const ipnUrl = "https://api.afrikanaccentadventures.com/api/pesapal/ipn"; // Replace with your actual deployed IPN endpoint
  const { ipn_id } = await pesapal.register_ipn_url({
    url: ipnUrl,
    ipn_notification_type: "POST",
  });

  ipnId = ipn_id;
  console.log("Registered IPN ID:", ipnId);
})();

// 📤 POST /payment - Create a dummy payment order
router.post("/payment", async (req, res) => {
  try {
    // Sample dummy data
    const dummyOrder = {
      id: "ORDER-12345",
      currency: "KES",
      amount: 1500.0,
      description: "Safari Tour Package",
      callback_url: "https://www.afrikanaccentadventures.com/payment/callback",
      notification_id: ipnId,
      billing_address: {
        email_address: "james@example.com",
        phone_number: "0727632051",
        country_code: "KE",
        first_name: "James",
        last_name: "Kagunga",
      },
    };

    const { redirect_url, order_tracking_id } = await pesapal.submit_order(dummyOrder);

    res.json({
      message: "Order submitted successfully",
      redirect_url,
      order_tracking_id,
    });
  } catch (err) {
    console.error("Payment submission error:", err.message);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// 📥 POST /ipn - Receive Pesapal payment notifications (IPN)
router.post("/ipn", async (req, res) => {
  try {
    const { OrderTrackingId, OrderMerchantReference } = req.query;

    if (!OrderTrackingId) {
      return res.status(400).json({ error: "Missing OrderTrackingId" });
    }

    const status = await pesapal.get_transaction_status({ OrderTrackingId });

    // Save status to DB, or log it
    console.log("IPN received for:", OrderMerchantReference);
    console.log("Status:", status.payment_status_description);

    // Acknowledge receipt
    res.json({
      orderNotificationType: "IPNCHANGE",
      orderTrackingId: OrderTrackingId,
      orderMerchantReference: OrderMerchantReference,
      status: 200,
    });
  } catch (err) {
    console.error("IPN handling error:", err.message);
    res.status(500).json({ error: "Failed to process IPN" });
  }
});

module.exports = router;
