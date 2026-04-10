const express  = require('express');
const bcrypt   = require('bcryptjs');
const router   = express.Router();
const db       = require('../db');
const { authenticateToken } = require('../middleware/auth');

// All routes in this file require admin role
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden' });
    }
    next();
}

// ─── GET /api/users ───────────────────────────────────────────────────────────
// Returns all users, paginated. Optional ?search= query filters by name/email.
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    const search = (req.query.search || '').trim();
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = 50;
    const offset = (page - 1) * limit;

    try {
        const params = search
            ? [`%${search}%`, limit, offset]
            : [limit, offset];

        const whereClause = search
            ? `WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1`
            : '';

        const paramOffset = search ? 1 : 0;

        const { rows } = await db.query(
            `SELECT id, first_name, last_name, email, role, created_at
             FROM users
             ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${paramOffset + 1} OFFSET $${paramOffset + 2}`,
            params
        );

        // Total count for pagination
        const countParams  = search ? [`%${search}%`] : [];
        const { rows: countRows } = await db.query(
            `SELECT COUNT(*)::int AS total FROM users ${whereClause}`,
            countParams
        );

        res.json({ users: rows, total: countRows[0].total, page, limit });
    } catch (err) {
        console.error('GET /api/users error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ─── POST /api/users ──────────────────────────────────────────────────────────
// Admin creates a user directly — no OTP flow, account is immediately active.
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    const { firstName, lastName, email, password, role } = req.body;

    if (!firstName?.trim()) return res.status(400).json({ message: 'First name is required' });
    if (!lastName?.trim())  return res.status(400).json({ message: 'Last name is required' });
    if (!email?.trim())     return res.status(400).json({ message: 'Email is required' });
    if (!password)          return res.status(400).json({ message: 'Password is required' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const allowedRoles = ['student', 'teacher', 'admin'];
    const assignedRole = allowedRoles.includes(role) ? role : 'student';

    try {
        // Check duplicate email
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ message: 'A user with that email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const { rows } = await db.query(
            `INSERT INTO users (first_name, last_name, email, password_hash, role)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, first_name, last_name, email, role, created_at`,
            [firstName.trim(), lastName.trim(), email.trim().toLowerCase(), hashedPassword, assignedRole]
        );

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('POST /api/users error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ─── PATCH /api/users/:id/role ────────────────────────────────────────────────
// Change a user's role. Admin cannot change their own role.
router.patch('/:id/role', authenticateToken, requireAdmin, async (req, res) => {
    const { role } = req.body;
    const targetId = req.params.id;

    if (targetId === req.user.id) {
        return res.status(400).json({ message: 'You cannot change your own role' });
    }

    const allowedRoles = ['student', 'teacher', 'admin'];
    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
    }

    try {
        const { rows } = await db.query(
            `UPDATE users SET role = $1 WHERE id = $2
             RETURNING id, first_name, last_name, email, role`,
            [role, targetId]
        );

        if (rows.length === 0) return res.status(404).json({ message: 'User not found' });

        res.json(rows[0]);
    } catch (err) {
        console.error('PATCH /api/users/:id/role error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ─── DELETE /api/users/:id ────────────────────────────────────────────────────
// Delete a user. Admin cannot delete themselves.
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    const targetId = req.params.id;

    if (targetId === req.user.id) {
        return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    try {
        const { rows } = await db.query(
            'DELETE FROM users WHERE id = $1 RETURNING id',
            [targetId]
        );

        if (rows.length === 0) return res.status(404).json({ message: 'User not found' });

        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('DELETE /api/users/:id error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;