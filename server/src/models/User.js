const pool = require('../db');

class User {
  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    return result.rows[0];
  }

  static async create(firstName, lastName, email, passwordHash, role = 'student') {
    const query = `
      INSERT INTO users (first_name, last_name, email, password_hash, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [firstName, lastName, email, passwordHash, role];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findById(id) {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Method to update user role (for admin use)
  static async updateRole(id, newRole) {
    const query = 'UPDATE users SET role = $1 WHERE id = $2 RETURNING *';
    const result = await pool.query(query, [newRole, id]);
    return result.rows[0];
  }
}

module.exports = User;