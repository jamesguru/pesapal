
const express = require("express");
const dotenv = require("dotenv");
const pesapalRoute = require("./routes/pesapal");
const cors = require("cors");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());


// ROUTES

app.use("/api/pesapal", pesapalRoute);


const PORT = process.env.PORT;



app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});