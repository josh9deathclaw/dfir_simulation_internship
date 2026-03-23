const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authenticateToken } = require('../middleware/auth');


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/results
//
// Returns the full history for the logged-in student — every scenario they
// have attempted, grouped so the frontend can render the accordion list.
//
// FIX: ROW_NUMBER() (window function) cannot be nested inside JSON_AGG()
// (aggregate function) in a single query level. We resolve this by using a
// CTE (WITH clause) that computes the attempt numbers first, then the outer
// query aggregates the pre-numbered rows. PostgreSQL evaluates CTEs before
// the outer GROUP BY, so the window function results are plain column values
// by the time JSON_AGG sees them.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { id: userId } = req.user;

        const result = await db.query(
            `WITH numbered_attempts AS (
                SELECT
                    a.id,
                    a.student_id,
                    a.scenario_id,
                    a.started_at,
                    a.completed_at,
                    a.graded_at,
                    a.status,
                    ROW_NUMBER() OVER (
                        PARTITION BY a.scenario_id
                        ORDER BY a.started_at ASC
                    ) AS attempt_number
                FROM attempts a
                WHERE a.student_id = $1
                AND   a.status IN ('completed', 'abandoned')
            )
            SELECT
                s.id                AS scenario_id,
                s.title             AS scenario_title,
                s.difficulty,
                s.estimated_time_minutes,

                (
                    SELECT MAX(
                        ROUND(
                            (SELECT COALESCE(SUM(r.score), 0)
                             FROM responses r WHERE r.attempt_id = na2.id)
                            /
                            NULLIF((
                                (SELECT COALESCE(SUM(q.max_score), 0)
                                 FROM responses r2
                                 JOIN questions q ON q.id = r2.question_id
                                 WHERE r2.attempt_id = na2.id)
                                +
                                (SELECT COALESCE(SUM(o.max_score), 0)
                                 FROM responses r3
                                 JOIN objectives o ON o.id = r3.objective_id
                                 WHERE r3.attempt_id = na2.id
                                 AND o.objective_type = 'side')
                            ), 0) * 100
                        )
                    )
                    FROM numbered_attempts na2
                    WHERE na2.scenario_id = s.id
                    AND   na2.student_id  = $1
                    AND   na2.graded_at IS NOT NULL
                )::float            AS best_score,

                (
                    SELECT ROUND(AVG(
                        (SELECT COALESCE(SUM(r.score), 0)
                         FROM responses r WHERE r.attempt_id = a2.id)
                        /
                        NULLIF((
                            (SELECT COALESCE(SUM(q.max_score), 0)
                             FROM responses r2
                             JOIN questions q ON q.id = r2.question_id
                             WHERE r2.attempt_id = a2.id)
                            +
                            (SELECT COALESCE(SUM(o.max_score), 0)
                             FROM responses r3
                             JOIN objectives o ON o.id = r3.objective_id
                             WHERE r3.attempt_id = a2.id
                             AND o.objective_type = 'side')
                        ), 0) * 100
                    ))::float
                    FROM attempts a2
                    WHERE a2.scenario_id  = s.id
                    AND   a2.graded_at IS NOT NULL
                )                   AS class_avg,

                JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'id',             na.id,
                        'attempt_number', na.attempt_number,
                        'started_at',     na.started_at,
                        'completed_at',   na.completed_at,
                        'graded_at',      na.graded_at,
                        'status',         na.status
                    )
                    ORDER BY na.started_at DESC
                )                   AS attempts

            FROM       numbered_attempts  na
            JOIN       scenarios          s  ON s.id = na.scenario_id
            GROUP BY   s.id, s.title, s.difficulty, s.estimated_time_minutes
            ORDER BY   MAX(na.completed_at) DESC NULLS LAST`,
            [userId]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('GET /api/results error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/results/attempts/:attemptId
//
// Returns full detail for a single attempt for the student detail panel.
// Scores and grader notes are gated behind graded_at — if not yet graded
// they come back null so the frontend never accidentally renders them.
// Security: verifies attempt belongs to the requesting student.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/attempts/:attemptId', authenticateToken, async (req, res) => {
    try {
        const { id: userId } = req.user;
        const { attemptId }  = req.params;

        const attemptResult = await db.query(
            `SELECT
                a.id,
                a.status,
                a.started_at,
                a.completed_at,
                a.graded_at,
                s.id    AS scenario_id,
                s.title AS scenario_title,
                s.difficulty
            FROM   attempts  a
            JOIN   scenarios s ON s.id = a.scenario_id
            WHERE  a.id         = $1
            AND    a.student_id = $2
            LIMIT  1`,
            [attemptId, userId]
        );

        if (attemptResult.rows.length === 0) {
            return res.status(403).json({ message: 'Attempt not found or access denied' });
        }

        const attempt  = attemptResult.rows[0];
        const isGraded = !!attempt.graded_at;

        const questionsResult = await db.query(
            `SELECT
                r.id              AS response_id,
                r.answer,
                r.submitted_at,
                CASE WHEN $2 THEN r.score        ELSE NULL END AS score,
                CASE WHEN $2 THEN r.grader_notes ELSE NULL END AS grader_notes,
                q.id              AS question_id,
                q.question_text,
                q.question_type,
                q.order_index,
                q.max_score,
                p.id              AS phase_id,
                p.title           AS phase_title,
                p.order_index     AS phase_order
            FROM   responses  r
            JOIN   questions  q ON q.id = r.question_id
            LEFT JOIN phases  p ON p.id = q.phase_id
            WHERE  r.attempt_id  = $1
            AND    r.question_id IS NOT NULL
            ORDER BY p.order_index NULLS LAST, q.order_index`,
            [attemptId, isGraded]
        );

        const objectivesResult = await db.query(
            `SELECT
                r.id              AS response_id,
                r.answer,
                r.is_correct,
                r.attempts_used,
                r.submitted_at,
                CASE WHEN $2 THEN r.score ELSE NULL END AS score,
                o.id              AS objective_id,
                o.description,
                o.order_index,
                o.max_score
            FROM   responses   r
            JOIN   objectives  o ON o.id = r.objective_id
            WHERE  r.attempt_id   = $1
            AND    r.objective_id IS NOT NULL
            AND    o.objective_type = 'side'
            ORDER BY o.order_index`,
            [attemptId, isGraded]
        );

        let totals = { earned_score: null, max_score: null, final_percentage: null };

        if (isGraded) {
            const totalsResult = await db.query(
                `SELECT
                    COALESCE(SUM(r.score), 0)::float AS earned_score,
                    (
                        SELECT COALESCE(SUM(q.max_score), 0)
                        FROM   responses r2
                        JOIN   questions q ON q.id = r2.question_id
                        WHERE  r2.attempt_id = $1
                    )::float +
                    (
                        SELECT COALESCE(SUM(o.max_score), 0)
                        FROM   responses r3
                        JOIN   objectives o ON o.id = r3.objective_id
                        WHERE  r3.attempt_id = $1
                        AND    o.objective_type = 'side'
                    )::float AS max_score
                FROM responses r
                WHERE r.attempt_id = $1`,
                [attemptId]
            );

            const t = totalsResult.rows[0];
            totals = {
                earned_score:     t.earned_score,
                max_score:        t.max_score,
                final_percentage: t.max_score > 0
                    ? Math.round((t.earned_score / t.max_score) * 100)
                    : 0
            };
        }

        const classAvgResult = await db.query(
            `SELECT ROUND(AVG(
                (SELECT COALESCE(SUM(r.score), 0) FROM responses r WHERE r.attempt_id = a.id)
                /
                NULLIF((
                    (SELECT COALESCE(SUM(q.max_score), 0)
                     FROM responses r2 JOIN questions q ON q.id = r2.question_id
                     WHERE r2.attempt_id = a.id)
                    +
                    (SELECT COALESCE(SUM(o.max_score), 0)
                     FROM responses r3 JOIN objectives o ON o.id = r3.objective_id
                     WHERE r3.attempt_id = a.id AND o.objective_type = 'side')
                ), 0) * 100
            ))::float AS class_avg
            FROM attempts a
            WHERE a.scenario_id = $1
            AND   a.graded_at IS NOT NULL`,
            [attempt.scenario_id]
        );

        res.json({
            attempt,
            questions:  questionsResult.rows,
            objectives: objectivesResult.rows,
            totals,
            class_avg:  classAvgResult.rows[0].class_avg
        });
    } catch (err) {
        console.error('GET /api/results/attempts/:attemptId error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


module.exports = router;