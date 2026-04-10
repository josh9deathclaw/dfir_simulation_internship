const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ─── POST /api/board/injects ──────────────────────────────────────────────────
// Called by SimulatorPage when an inject is delivered to the student.
// Records the delivery so teachers can reconstruct the board later.
// Body: { attempt_id, inject_id }
router.post('/injects', authenticateToken, async (req, res) => {
    const { attempt_id, inject_id } = req.body;
    const { id: userId } = req.user;

    if (!attempt_id || !inject_id) {
        return res.status(400).json({ message: 'attempt_id and inject_id are required' });
    }

    try {
        // Verify the attempt belongs to this student (or teacher/admin reviewing)
        const attemptRes = await db.query(
            'SELECT student_id FROM attempts WHERE id = $1',
            [attempt_id]
        );
        if (attemptRes.rows.length === 0) {
            return res.status(404).json({ message: 'Attempt not found' });
        }
        if (req.user.role === 'student' && attemptRes.rows[0].student_id !== userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Upsert — safe to call multiple times for same inject
        await db.query(
            `INSERT INTO attempt_injects (attempt_id, inject_id)
             VALUES ($1, $2)
             ON CONFLICT (attempt_id, inject_id) DO NOTHING`,
            [attempt_id, inject_id]
        );

        res.status(201).json({ ok: true });
    } catch (err) {
        console.error('POST /api/board/injects error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ─── GET /api/board/:attemptId ────────────────────────────────────────────────
// Returns the saved board state + the list of injects that were delivered
// during this attempt (so the board can reconstruct the cards).
// Students can only read their own. Teachers/admins can read any.
router.get('/:attemptId', authenticateToken, async (req, res) => {
    const { attemptId } = req.params;
    const { id: userId, role } = req.user;

    try {
        // Auth check
        const attemptRes = await db.query(
            'SELECT student_id FROM attempts WHERE id = $1',
            [attemptId]
        );
        if (attemptRes.rows.length === 0) {
            return res.status(404).json({ message: 'Attempt not found' });
        }
        if (role === 'student' && attemptRes.rows[0].student_id !== userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Load board state (may not exist yet)
        const stateRes = await db.query(
            'SELECT nodes, edges, annotations, updated_at FROM board_states WHERE attempt_id = $1',
            [attemptId]
        );

        // Load the injects that were actually delivered during this attempt,
        // joining back to the injects table for the full inject data
        const injectsRes = await db.query(
            `SELECT
                 i.id,
                 i.title,
                 i.description,
                 i.file_type,
                 i.file_path,
                 i.file_name,
                 ai.received_at
             FROM attempt_injects ai
             JOIN injects i ON i.id = ai.inject_id
             WHERE ai.attempt_id = $1
             ORDER BY ai.received_at ASC`,
            [attemptId]
        );

        res.json({
            boardState: stateRes.rows[0] || null,
            injects:    injectsRes.rows,
        });
    } catch (err) {
        console.error('GET /api/board/:attemptId error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ─── PUT /api/board/:attemptId ────────────────────────────────────────────────
// Upserts the full board state for an attempt.
// Only the student who owns the attempt can save (teachers view read-only).
// Body: { nodes, edges, annotations }
router.put('/:attemptId', authenticateToken, async (req, res) => {
    const { attemptId } = req.params;
    const { id: userId, role } = req.user;
    const { nodes = [], edges = [], annotations = {} } = req.body;

    try {
        // Only the owning student (or admin) can write board state
        const attemptRes = await db.query(
            'SELECT student_id FROM attempts WHERE id = $1',
            [attemptId]
        );
        if (attemptRes.rows.length === 0) {
            return res.status(404).json({ message: 'Attempt not found' });
        }
        if (role === 'student' && attemptRes.rows[0].student_id !== userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        if (role === 'teacher') {
            return res.status(403).json({ message: 'Teachers cannot modify a student\'s board' });
        }

        await db.query(
            `INSERT INTO board_states (attempt_id, nodes, edges, annotations, updated_at)
             VALUES ($1, $2, $3, $4, now())
             ON CONFLICT (attempt_id) DO UPDATE
             SET nodes = EXCLUDED.nodes,
                 edges = EXCLUDED.edges,
                 annotations = EXCLUDED.annotations,
                 updated_at = now()`,
            [attemptId, JSON.stringify(nodes), JSON.stringify(edges), JSON.stringify(annotations)]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('PUT /api/board/:attemptId error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;