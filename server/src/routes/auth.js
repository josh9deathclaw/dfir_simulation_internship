const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User     = require('../models/User');
const db       = require('../db');
const router   = express.Router();
const { authenticateToken } = require('../middleware/auth');

// ─── Email transporter (Gmail SMTP) ──────────────────────────────────────────
// Requires EMAIL_USER and EMAIL_PASS in your .env file.
// EMAIL_PASS should be a Gmail App Password (not your account password).
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// ─── Generate a random 6-digit OTP ───────────────────────────────────────────
function generateOTP() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── Send OTP email ───────────────────────────────────────────────────────────
async function sendOTPEmail(toEmail, firstName, otp) {
    await transporter.sendMail({
        from:    `"DFIR Platform" <${process.env.EMAIL_USER}>`,
        to:      toEmail,
        subject: 'Your verification code',
        text:    `Hi ${firstName},\n\nYour verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not register, ignore this email.`,
        html:    `
            <div style="font-family: monospace; max-width: 480px; margin: 0 auto; padding: 32px; background: #070d1a; color: #b4dcf0; border: 1px solid rgba(76,201,240,0.15);">
                <h2 style="color: #4cc9f0; letter-spacing: 0.15em; font-size: 14px; margin: 0 0 24px;">DFIR SIMULATION PLATFORM</h2>
                <p style="margin: 0 0 8px;">Hi ${firstName},</p>
                <p style="margin: 0 0 24px; color: rgba(120,160,180,0.8);">Your verification code is:</p>
                <div style="font-size: 36px; font-weight: 700; letter-spacing: 0.3em; color: #4cc9f0; background: rgba(76,201,240,0.06); border: 1px solid rgba(76,201,240,0.2); padding: 16px 24px; text-align: center; margin-bottom: 24px;">
                    ${otp}
                </div>
                <p style="color: rgba(120,160,180,0.6); font-size: 12px; margin: 0;">This code expires in <strong>10 minutes</strong>. If you did not register, ignore this email.</p>
            </div>
        `,
    });
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Validates input, hashes password, stores a pending registration, sends OTP.
// Does NOT create a real user yet — that happens on /verify.
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;

        if (!firstName?.trim() || !lastName?.trim()) {
            return res.status(400).json({ message: 'First and last name are required.' });
        }
        if (!email?.trim()) {
            return res.status(400).json({ message: 'Email is required.' });
        }
        if (!password || password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters.' });
        }
        if (!/[0-9]/.test(password)) {
            return res.status(400).json({ message: 'Password must contain at least one number.' });
        }
        if (!/[!@#$%^&*()_+\-=[\]{};':"\|,.<>/?]/.test(password)) {
            return res.status(400).json({ message: 'Password must contain at least one symbol.' });
        }

        const normalEmail = email.trim().toLowerCase();

        // Reject if a verified account already exists with this email
        const existingUser = await User.findByEmail(normalEmail);
        if (existingUser) {
            return res.status(400).json({ message: 'An account with that email already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOTP();

        // Delete any previous pending registration for this email, then insert fresh.
        // This handles the case where someone re-registers before their code expires.
        await db.query('DELETE FROM pending_users WHERE email = $1', [normalEmail]);
        await db.query(
            `INSERT INTO pending_users (first_name, last_name, email, password_hash, otp_code, expires_at)
             VALUES ($1, $2, $3, $4, $5, now() + INTERVAL '10 minutes')`,
            [firstName.trim(), lastName.trim(), normalEmail, hashedPassword, otp]
        );

        // Send the OTP — if email fails, clean up and surface the error
        try {
            await sendOTPEmail(normalEmail, firstName.trim(), otp);
        } catch (emailErr) {
            console.error('OTP email send failed:', emailErr);
            await db.query('DELETE FROM pending_users WHERE email = $1', [normalEmail]);
            return res.status(500).json({ message: 'Failed to send verification email. Please try again.' });
        }

        // Tell the frontend to show the OTP entry screen.
        // We return the email so the frontend can display it and pass it back on verify.
        res.status(200).json({ message: 'Verification code sent.', email: normalEmail });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// ─── POST /api/auth/verify ────────────────────────────────────────────────────
// Checks the OTP. On success: creates the real user, deletes the pending row,
// returns a JWT so the frontend can log the user in immediately.
router.post('/verify', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and code are required.' });
        }

        const normalEmail = email.trim().toLowerCase();
        const normalOTP   = otp.trim();

        // Find the pending registration
        const { rows } = await db.query(
            'SELECT * FROM pending_users WHERE email = $1',
            [normalEmail]
        );

        if (rows.length === 0) {
            return res.status(400).json({ message: 'No pending registration found. Please register again.' });
        }

        const pending = rows[0];

        // Check expiry
        if (new Date() > new Date(pending.expires_at)) {
            await db.query('DELETE FROM pending_users WHERE email = $1', [normalEmail]);
            return res.status(400).json({ message: 'Verification code has expired. Please register again.' });
        }

        // Check OTP
        if (pending.otp_code !== normalOTP) {
            return res.status(400).json({ message: 'Incorrect verification code.' });
        }

        // OTP is valid — create the real user account
        const newUser = await User.create(
            pending.first_name,
            pending.last_name,
            pending.email,
            pending.password_hash,  // already hashed
            'student'
        );

        // Clean up the pending row
        await db.query('DELETE FROM pending_users WHERE email = $1', [normalEmail]);

        // Issue a JWT so the user is logged in immediately after verifying
        const token = jwt.sign(
            { id: newUser.id, email: newUser.email, role: newUser.role },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(201).json({
            message: 'Account verified successfully.',
            token,
            user: {
                id:        newUser.id,
                firstName: newUser.first_name,
                lastName:  newUser.last_name,
                email:     newUser.email,
                role:      newUser.role,
            },
        });

    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// ─── POST /api/auth/resend ────────────────────────────────────────────────────
// Generates a fresh OTP and resets the expiry. Rate limiting is handled by
// the frontend (button cooldown) — add express-rate-limit here if needed later.
router.post('/resend', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required.' });

        const normalEmail = email.trim().toLowerCase();

        const { rows } = await db.query(
            'SELECT * FROM pending_users WHERE email = $1',
            [normalEmail]
        );

        if (rows.length === 0) {
            return res.status(400).json({ message: 'No pending registration found. Please register again.' });
        }

        const pending  = rows[0];
        const newOTP   = generateOTP();

        await db.query(
            `UPDATE pending_users
             SET otp_code = $1, expires_at = now() + INTERVAL '10 minutes'
             WHERE email = $2`,
            [newOTP, normalEmail]
        );

        try {
            await sendOTPEmail(normalEmail, pending.first_name, newOTP);
        } catch (emailErr) {
            console.error('Resend email failed:', emailErr);
            return res.status(500).json({ message: 'Failed to resend verification email.' });
        }

        res.json({ message: 'New verification code sent.' });

    } catch (error) {
        console.error('Resend error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findByEmail(email);
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id:        user.id,
                firstName: user.first_name,
                lastName:  user.last_name,
                email:     user.email,
                role:      user.role,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        res.json({
            id:        user.id,
            firstName: user.first_name,
            lastName:  user.last_name,
            email:     user.email,
            role:      user.role,
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error.' });
    }
});

module.exports = router;