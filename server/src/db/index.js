require('dotenv').config();
const {Pool} = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:{
        rejectUnauthorized: false
    }
});

console.log("DATABASE_URL:", process.env.DATABASE_URL);

pool.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch((err) => console.error('Database connection error:', err));

module.exports = pool;