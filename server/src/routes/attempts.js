// server/src/routes/attempts.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ── POST / — create or resume attempt ────────────────────────────────────────
router.post('/', authenticateToken, async (req, res) => {
    const { id: userId }  = req.user;
    const { scenario_id } = req.body;

    if (!scenario_id) return res.status(400).json({ message: 'scenario_id is required' });

    try {
        const existing = await db.query(
            `SELECT id FROM attempts
             WHERE student_id = $1 AND scenario_id = $2 AND status = 'active'`,
            [userId, scenario_id]
        );

        if (existing.rows.length > 0) {
            return res.json({ attempt_id: existing.rows[0].id, resumed: true });
        }

        const result = await db.query(
            `INSERT INTO attempts (student_id, scenario_id, status, started_at, scenario_time_minutes)
             VALUES ($1, $2, 'active', NOW(), 0)
             RETURNING id`,
            [userId, scenario_id]
        );

        res.status(201).json({ attempt_id: result.rows[0].id, resumed: false });

    } catch (err) {
        console.error('POST /api/attempts error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ── PATCH /:id/complete ───────────────────────────────────────────────────────
router.patch('/:id/complete', authenticateToken, async (req, res) => {
    const { id: userId } = req.user;
    try {
        const result = await db.query(
            `UPDATE attempts
             SET status = 'completed', completed_at = NOW()
             WHERE id = $1 AND student_id = $2 AND status = 'active'
             RETURNING id`,
            [req.params.id, userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Active attempt not found' });
        }
        res.json({ message: 'Attempt completed', attempt_id: result.rows[0].id });
    } catch (err) {
        console.error('PATCH /api/attempts/:id/complete error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ── POST /:id/decisions — record a student's decision choice (narrative) ──────
// Body: { decision_id, chosen_option_id, scenario_time_before, time_cost_minutes }
// Note: score_delta removed — scoring is no longer derived from decisions.
// State variable persistence is handled by the separate POST /:id/state route,
// which the client calls before this route to ensure consistency on reload.
router.post('/:id/decisions', authenticateToken, async (req, res) => {
    const { id: userId } = req.user;
    const attemptId = req.params.id;
    const { decision_id, chosen_option_id, scenario_time_before, time_cost_minutes } = req.body;

    if (!decision_id || !chosen_option_id) {
        return res.status(400).json({ message: 'decision_id and chosen_option_id are required' });
    }

    try {
        // Verify attempt belongs to this student
        const attemptRes = await db.query(
            `SELECT id, scenario_time_minutes FROM attempts
             WHERE id = $1 AND student_id = $2 AND status = 'active'`,
            [attemptId, userId]
        );
        if (attemptRes.rows.length === 0) {
            return res.status(404).json({ message: 'Active attempt not found' });
        }

        const newScenarioTime = (scenario_time_before || 0) + (time_cost_minutes || 0);

        // Log the decision
        await db.query(
            `INSERT INTO attempt_decisions
                 (attempt_id, decision_id, chosen_option_id,
                  scenario_time_at_choice, chosen_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [attemptId, decision_id, chosen_option_id, scenario_time_before || 0]
        );

        // Advance scenario time on the attempt record
        await db.query(
            `UPDATE attempts SET scenario_time_minutes = $1 WHERE id = $2`,
            [newScenarioTime, attemptId]
        );

        res.status(201).json({
            scenario_time_minutes: newScenarioTime,
            message: 'Decision recorded',
        });

    } catch (err) {
        console.error('POST /api/attempts/:id/decisions error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ── GET /:id/state — load all key-value state for an attempt ─────────────────
// Returns { state: { key: value, ... } }
router.get('/:id/state', authenticateToken, async (req, res) => {
    const { id: userId } = req.user;
    const attemptId = req.params.id;

    try {
        // Verify attempt belongs to this student (or teacher/admin)
        const attemptRes = await db.query(
            `SELECT a.id FROM attempts a
             WHERE a.id = $1
               AND (
                 a.student_id = $2
                 OR EXISTS (
                   SELECT 1 FROM users u WHERE u.id = $2 AND u.role IN ('teacher', 'admin')
                 )
               )`,
            [attemptId, userId]
        );
        if (attemptRes.rows.length === 0) {
            return res.status(404).json({ message: 'Attempt not found' });
        }

        const result = await db.query(
            `SELECT key, value FROM attempt_state WHERE attempt_id = $1`,
            [attemptId]
        );

        const state = {};
        result.rows.forEach(({ key, value }) => { state[key] = value; });

        res.json({ state });

    } catch (err) {
        console.error('GET /api/attempts/:id/state error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ── POST /:id/state — upsert key-value state variables for an attempt ─────────
// Body: { updates: { key: value, ... } }
// Uses ON CONFLICT upsert — safe to call multiple times with the same keys.
router.post('/:id/state', authenticateToken, async (req, res) => {
    const { id: userId } = req.user;
    const attemptId = req.params.id;
    const { updates } = req.body;

    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        return res.status(400).json({ message: 'updates must be a key-value object' });
    }

    const entries = Object.entries(updates);
    if (entries.length === 0) {
        return res.json({ message: 'No updates provided', updated: 0 });
    }

    try {
        // Verify attempt belongs to this student and is active
        const attemptRes = await db.query(
            `SELECT id FROM attempts
             WHERE id = $1 AND student_id = $2 AND status = 'active'`,
            [attemptId, userId]
        );
        if (attemptRes.rows.length === 0) {
            return res.status(404).json({ message: 'Active attempt not found' });
        }

        // Upsert each key-value pair. Using individual upserts in a transaction
        // rather than a bulk insert to keep the query simple and avoid parameter
        // count limits for large state objects.
        await db.query('BEGIN');
        try {
            for (const [key, value] of entries) {
                await db.query(
                    `INSERT INTO attempt_state (attempt_id, key, value)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (attempt_id, key)
                     DO UPDATE SET value = EXCLUDED.value`,
                    [attemptId, key, String(value)]
                );
            }
            await db.query('COMMIT');
        } catch (innerErr) {
            await db.query('ROLLBACK');
            throw innerErr;
        }

        res.status(201).json({ message: 'State updated', updated: entries.length });

    } catch (err) {
        console.error('POST /api/attempts/:id/state error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ── POST /:id/injects/:injectId/extract — freeze evidence quality ─────────────
// Body: { quality: 'High' | 'Low', scenario_time: number }
router.post('/:id/injects/:injectId/extract', authenticateToken, async (req, res) => {
    const { id: userId }  = req.user;
    const { id: attemptId, injectId } = req.params;
    const { quality, scenario_time } = req.body;

    if (!quality) return res.status(400).json({ message: 'quality is required' });

    try {
        // Verify attempt
        const attemptRes = await db.query(
            `SELECT id FROM attempts WHERE id = $1 AND student_id = $2 AND status = 'active'`,
            [attemptId, userId]
        );
        if (attemptRes.rows.length === 0) {
            return res.status(404).json({ message: 'Active attempt not found' });
        }

        // Upsert the inject state row
        await db.query(
            `INSERT INTO attempt_inject_state
                 (attempt_id, inject_id, status, quality,
                  discovered_at_scenario_time, extracted_at_scenario_time)
             VALUES ($1, $2, 'extracted', $3, $4, $4)
             ON CONFLICT (attempt_id, inject_id)
             DO UPDATE SET
                 status = 'extracted',
                 quality = EXCLUDED.quality,
                 extracted_at_scenario_time = EXCLUDED.extracted_at_scenario_time`,
            [attemptId, injectId, quality, scenario_time || 0]
        );

        res.status(201).json({ message: 'Extraction recorded', quality });

    } catch (err) {
        console.error('POST /api/attempts/:id/injects/:injectId/extract error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;