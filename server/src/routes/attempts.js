// server/src/routes/attempts.js
//
// Handles attempt lifecycle and answer submissions.
// Register in index.js with:
//   const attemptsRoutes = require('./routes/attempts');
//   app.use('/api/attempts', attemptsRoutes);

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authenticateToken } = require('../middleware/auth');


// ── POST /api/attempts ────────────────────────────────────────────────────────
// Creates an attempt record when a student starts a scenario.
// If an active attempt already exists for this student+scenario, it returns
// that instead of creating a duplicate. This handles page refreshes cleanly.
//
// Returns: { attempt_id: UUID, resumed: boolean }
//   resumed: false → fresh attempt created
//   resumed: true  → existing active attempt returned
router.post('/', authenticateToken, async (req, res) => {
    const { id: userId }    = req.user;
    const { scenario_id }   = req.body;

    if (!scenario_id) {
        return res.status(400).json({ message: 'scenario_id is required' });
    }

    try {
        // Check for an existing active attempt first.
        // We don't want multiple active rows for the same student+scenario —
        // that would cause confusion when the teacher reviews results.
        const existing = await db.query(
            `SELECT id FROM attempts
             WHERE student_id = $1
               AND scenario_id = $2
               AND status = 'active'`,
            [userId, scenario_id]
        );

        if (existing.rows.length > 0) {
            return res.json({
                attempt_id: existing.rows[0].id,
                resumed: true,
            });
        }

        // No active attempt — create a fresh one.
        // started_at is set to NOW() by the DB default but we set it explicitly
        // here so the value is predictable for reporting.
        const result = await db.query(
            `INSERT INTO attempts (student_id, scenario_id, status, started_at)
             VALUES ($1, $2, 'active', NOW())
             RETURNING id`,
            [userId, scenario_id]
        );

        res.status(201).json({
            attempt_id: result.rows[0].id,
            resumed: false,
        });

    } catch (err) {
        console.error('POST /api/attempts error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ── PATCH /api/attempts/:id/complete ─────────────────────────────────────────
// Marks an attempt as completed. Called when:
//   - The last phase ends with no questions (immediate complete)
//   - The student submits end-of-scenario questions
//
// The student_id check prevents one student from completing another's attempt.
router.patch('/:id/complete', authenticateToken, async (req, res) => {
    const { id: userId } = req.user;

    try {
        const result = await db.query(
            `UPDATE attempts
             SET status = 'completed', completed_at = NOW()
             WHERE id = $1
               AND student_id = $2
               AND status = 'active'
             RETURNING id`,
            [req.params.id, userId]
        );

        if (result.rows.length === 0) {
            // Either wrong ID, wrong user, or already completed — all fine
            return res.status(404).json({ message: 'Active attempt not found' });
        }

        res.json({ message: 'Attempt completed', attempt_id: result.rows[0].id });

    } catch (err) {
        console.error('PATCH /api/attempts/:id/complete error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


module.exports = router;