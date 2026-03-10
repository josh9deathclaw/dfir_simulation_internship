const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL 
});

const users = [
  {
    first_name: 'Admin',
    last_name: 'User',
    email: 'admin@gmail.com',
    password: '123456',
    role: 'admin'
  },
  {
    first_name: 'Teacher',
    last_name: 'User',
    email: 'teacher@gmail.com',
    password: '123456',
    role: 'teacher'
  }
];

const seed = async () => {
  for (const user of users) {
    const password_hash = await bcrypt.hash(user.password, 10);
    await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING`,
      [user.first_name, user.last_name, user.email, password_hash, user.role]
    );
    console.log(`Seeded: ${user.email}`);
  }
  await pool.end();
};

seed().catch(console.error);