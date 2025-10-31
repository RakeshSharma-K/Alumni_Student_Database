const { Pool } = require("pg");

// 🚨 IMPORTANT: Update these credentials to match your PostgreSQL setup
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "Alumini_Student", 
  password: "123456789", 
  port: 5433,
});

module.exports = {
  // Export a function to execute queries
  query: (text, params) => pool.query(text, params),
};