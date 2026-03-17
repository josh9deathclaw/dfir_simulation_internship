// server/src/routes/submissions.js
//
// Saves a batch of question answers from a student.
// Called after the student fills in the phase or end-of-scenario questions modal.
//
// Register in index.js:
//   const submissionsRoutes = require('./routes/submissions');
//   app.use('/api/submissions', submissionsRoutes);

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authenticateToken } = require('../middleware/auth');


// ── POST /api/submissions ─────────────────────────────────────────────────────
// Request body:
// {
//   attempt_id: UUID,
//   answers: [
//     { question_id: UUID, answer: "string" },
//     ...
//   ]
// }
//
// All answers are inserted in a single transaction — either all succeed or
// none do. This prevents partial submissions where only some questions were
// recorded if something fails midway through.
//
// ON CONFLICT handles the case where a student re-submits (e.g. page refresh
// before the modal advanced). It updates the answer rather than erroring.
//
// score is left NULL — grading is a separate step done by the teacher later.
router.post('/', authenticateToken, async (req, res) => {
    const { id: userId }          = req.user;
    const { attempt_id, answers } = req.body;

    if (!attempt_id) {
        return res.status(400).json({ message: 'attempt_id is required' });
    }
    if (!Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({ message: 'answers array is required and must not be empty' });
    }

    try {
        // Verify the attempt belongs to this student and is still active.
        // Prevents submitting against someone else's attempt or a completed one.
        const attemptCheck = await db.query(
            `SELECT id FROM attempts
             WHERE id = $1 AND student_id = $2 AND status = 'active'`,
            [attempt_id, userId]
        );

        if (attemptCheck.rows.length === 0) {
            return res.status(403).json({ message: 'Invalid or inactive attempt' });
        }

        // Use a transaction client so all inserts are atomic.
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            for (const { question_id, answer } of answers) {
                // Skip any malformed entries rather than failing the whole batch.
                if (!question_id || !answer?.trim()) continue;

                await client.query(
                    `INSERT INTO submissions (question_id, student_id, answer, submitted_at)
                     VALUES ($1, $2, $3, NOW())
                     ON CONFLICT (question_id, student_id)
                     DO UPDATE SET
                         answer       = EXCLUDED.answer,
                         submitted_at = NOW()`,
                    [question_id, userId, answer.trim()]
                );
            }

            await client.query('COMMIT');
            res.status(201).json({ message: 'Answers submitted successfully' });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error('POST /api/submissions error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ── GET /api/submissions/attempt/:attemptId ───────────────────────────────────
// Returns all submissions for a given attempt.
// Used by the grading page (teacher view) to see what a student answered.
// Teachers can only see submissions for scenarios they created.
router.get('/attempt/:attemptId', authenticateToken, async (req, res) => {
    const { id: userId, role } = req.user;

    try {
        // Teachers: verify they own the scenario this attempt belongs to.
        // Students: verify the attempt belongs to them.
        if (role === 'teacher' || role === 'admin') {
            const ownerCheck = await db.query(
                `SELECT a.id FROM attempts a
                 JOIN scenarios s ON s.id = a.scenario_id
                 WHERE a.id = $1 AND (s.created_by = $2 OR $3)`,
                [req.params.attemptId, userId, role === 'admin']
            );
            if (ownerCheck.rows.length === 0) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        } else {
            const ownerCheck = await db.query(
                `SELECT id FROM attempts WHERE id = $1 AND student_id = $2`,
                [req.params.attemptId, userId]
            );
            if (ownerCheck.rows.length === 0) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        const { rows } = await db.query(
            `SELECT
                 s.id,
                 s.question_id,
                 q.question_text,
                 q.question_type,
                 s.answer,
                 s.score,
                 s.submitted_at
             FROM submissions s
             JOIN questions q ON q.id = s.question_id
             JOIN attempts  a ON a.id = $1
             WHERE s.student_id = a.student_id
               AND q.phase_id IN (
                   SELECT id FROM phases WHERE scenario_id = a.scenario_id
               )
             ORDER BY s.submitted_at ASC`,
            [req.params.attemptId]
        );

        res.json(rows);

    } catch (err) {
        console.error('GET /api/submissions/attempt/:attemptId error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


module.exports = router;