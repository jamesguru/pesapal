const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

const pool = mysql.createPool({
  host: "127.0.0.1", // or your DB host
  user: "panyako",
  password: "insync88PX",
  database: "afrikanaccentlaravel",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;