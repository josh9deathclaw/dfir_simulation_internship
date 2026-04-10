const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ─── GET /api/dashboard/pending (teacher only) ────────────────────────────────
// Returns completed attempts that still have at least one unscored response
// (score IS NULL on a question response), for scenarios the teacher owns.
// Used by: Dashboard.jsx TeacherDashboard component
router.get('/pending', authenticateToken, async (req, res) => {
    const { id: userId, role } = req.user;
    if (role !== 'teacher' && role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden' });
    }

    try {
        const { rows } = await db.query(
            `SELECT DISTINCT
                 a.id,
                 s.title                              AS scenario_title,
                 u.first_name || ' ' || u.last_name  AS student_name,
                 c.name                               AS class_name,
                 a.completed_at
             FROM attempts a
             JOIN scenarios s        ON s.id = a.scenario_id
             JOIN users u            ON u.id = a.student_id
             -- Join via scenario_classes to get the class name
             LEFT JOIN scenario_classes sc ON sc.scenario_id = s.id
             LEFT JOIN classes c           ON c.id = sc.class_id
             -- Only attempts with at least one unscored question response
             WHERE s.created_by   = $1
               AND a.completed_at IS NOT NULL
               AND EXISTS (
                   SELECT 1 FROM responses r
                   JOIN questions q ON q.id = r.question_id
                   WHERE r.attempt_id = a.id
                     AND r.score IS NULL
               )
             ORDER BY a.completed_at DESC`,
            [userId]
        );

        res.json(rows);
    } catch (err) {
        console.error('GET /api/dashboard/pending error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ─── GET /api/dashboard/summary (student only) ────────────────────────────────
// Returns:
//   newestScenario — the most recently created published scenario available to
//                    this student via their class enrolments (or null)
//   latestAttempt  — their most recently completed attempt with score summary
//                    (or null if no completed attempts)
// Used by: Dashboard.jsx StudentDashboard component
router.get('/summary', authenticateToken, async (req, res) => {
    const { id: userId, role } = req.user;
    if (role !== 'student') {
        return res.status(403).json({ message: 'Forbidden' });
    }

    try {
        // ── Newest available scenario ──────────────────────────────────────────
        const scenarioRes = await db.query(
            `SELECT
                 s.id,
                 s.title,
                 s.difficulty,
                 s.estimated_time_minutes,
                 c.name AS class_name
             FROM scenarios s
             JOIN scenario_classes sc  ON sc.scenario_id = s.id
             JOIN classes c            ON c.id = sc.class_id
             JOIN class_enrolments ce  ON ce.class_id  = c.id
                                      AND ce.student_id = $1
             WHERE s.is_published = TRUE
             ORDER BY s.created_at DESC
             LIMIT 1`,
            [userId]
        );

        const newestScenario = scenarioRes.rows[0] || null;

        // ── Latest completed attempt ───────────────────────────────────────────
        const attemptRes = await db.query(
            `SELECT
                 a.id,
                 s.title                              AS scenario_title,
                 a.completed_at,
                 -- Sum of all scored responses for this attempt
                 COALESCE(SUM(r.score), 0)            AS score,
                 -- Max possible: sum of max_score from questions + objectives
                 (
                     SELECT COALESCE(SUM(q.max_score), 0)
                     FROM questions q WHERE q.scenario_id = s.id
                 ) + (
                     SELECT COALESCE(SUM(o.max_score), 0)
                     FROM objectives o WHERE o.scenario_id = s.id
                 )                                    AS max_score,
                 -- Flag: any responses still unscored?
                 BOOL_OR(r.question_id IS NOT NULL AND r.score IS NULL) AS awaiting_grade
             FROM attempts a
             JOIN scenarios s ON s.id = a.scenario_id
             LEFT JOIN responses r ON r.attempt_id = a.id
             WHERE a.student_id   = $1
               AND a.completed_at IS NOT NULL
             GROUP BY a.id, s.id, s.title, a.completed_at
             ORDER BY a.completed_at DESC
             LIMIT 1`,
            [userId]
        );

        const raw = attemptRes.rows[0] || null;

        let latestAttempt = null;
        if (raw) {
            latestAttempt = {
                id:             raw.id,
                scenario_title: raw.scenario_title,
                completed_at:   raw.completed_at,
                // If any question is unscored, surface null so frontend shows "Awaiting grade"
                score:          raw.awaiting_grade ? null : Number(raw.score),
                max_score:      Number(raw.max_score),
            };
        }

        res.json({ newestScenario, latestAttempt });
    } catch (err) {
        console.error('GET /api/dashboard/summary error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;