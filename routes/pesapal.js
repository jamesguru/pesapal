const express = require("express");
const dotenv = require("dotenv");
const router = express.Router();
const axios = require("axios");


dotenv.config();

var pesapal = require("pesapal")({
  consumerKey: process.env.CONSUMER_KEY,
  consumerSecret: process.env.CONSUMER_SECRET,
  testing: false,
});

router.post("/payment", async (req, res) => {
  try {
    var postParams = {
      oauth_callback: "http://localhost:5000/api/pesapal/callback",
    };
    var requestData = {
      Amount: 10.00,
      Description: "Testing",
      Type: "TYPE",
      Reference: "6729202827262",
      PhoneNumber: "254727632051",
    };

    var url = pesapal.postDirectOrder(postParams, requestData);

    console.log("URL FROM PESAPAL", url)

    res.send(url);
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

router.get("/callback", async (req, res) => {
  // const reference = req.body.reference;
  // const transaction = req.body.transaction;
  // const status = req.body.status;

  res.status(200).json({success: "payment successful" });
});

module.exports = router;