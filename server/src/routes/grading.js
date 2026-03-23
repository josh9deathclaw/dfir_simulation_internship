const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { route } = require('./scenarios');

// GET /api/grading/classes
// Return list classes beloning to logged-in teacher
// For each scenario, count how may attempts are completed but not yet graded
router.get('/classes', authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;
        if (role !== 'teacher' && role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const result = await db.query(
            `SELECT
                c.id,
                c.name,
                c.enrolment_code,
                c.created_at,
 
                -- Count of students enrolled in this class
                COUNT(DISTINCT ce.student_id)::int AS student_count,
 
                -- One JSON object per assigned scenario, bundled into an array.
                -- FILTER (WHERE sc.scenario_id IS NOT NULL) skips the NULL row
                -- that LEFT JOIN produces when a class has no scenarios yet.
                JSON_AGG(
                    DISTINCT JSONB_BUILD_OBJECT(
                        'id',              s.id,
                        'title',           s.title,
                        'difficulty',      s.difficulty,
                        'needs_grading',   (
                            SELECT COUNT(*)::int
                            FROM   attempts a
                            WHERE  a.scenario_id = s.id
                            AND    a.status      = 'completed'
                            AND    a.graded_at   IS NULL
                            AND    a.student_id  IN (
                                SELECT student_id
                                FROM   class_enrolments
                                WHERE  class_id = c.id
                            )
                        ),
                        'total_completed', (
                            SELECT COUNT(*)::int
                            FROM   attempts a
                            WHERE  a.scenario_id = s.id
                            AND    a.status      = 'completed'
                            AND    a.student_id  IN (
                                SELECT student_id
                                FROM   class_enrolments
                                WHERE  class_id = c.id
                            )
                        )
                    )
                ) FILTER (WHERE s.id IS NOT NULL) AS scenarios
 
            FROM       classes           c
            LEFT JOIN  class_enrolments  ce ON ce.class_id   = c.id
            LEFT JOIN  scenario_classes  sc ON sc.class_id   = c.id
            LEFT JOIN  scenarios         s  ON s.id          = sc.scenario_id
            WHERE      c.teacher_id = $1
            GROUP BY   c.id
            ORDER BY   c.created_at DESC`,
            [userId]
        );
 
        res.json(result.rows);
    } catch (err) {
        console.error('GET /api/grading/classes error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// GET /api/grading/attempts/:scenarioId
// Return every student enrolled in the given class
// Include all attempts with grading status

// Grading status per attempt is derived as:
//   - graded_at IS NOT NULL                         → 'graded'
//   - graded_at IS NULL, status = 'completed'       → 'needs_grading'
//   - status = 'active'                             → 'in_progress'
//   - status = 'abandoned'                          → 'abandoned'

router.get('/classes/:classId/scenarios/:scenarioId/students', authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;
        const { classId, scenarioId } = req.params;
 
        if (role !== 'teacher' && role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const ownerCheck = await db.query(
            `SELECT id FROM classes WHERE id = $1 AND teacher_id = $2`,
            [classId, userId]
        );

        if (ownerCheck.rows.length === 0) {
            return res.status(403).json({ message: 'Forbidden' });
        }

                const result = await db.query(
            `SELECT
                u.id,
                u.first_name,
                u.last_name,
                u.email,
 
                -- Aggregate all attempts for this student+scenario into an array.
                -- Each attempt object has everything the student list card needs.
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'id',             a.id,
                            'started_at',     a.started_at,
                            'completed_at',   a.completed_at,
                            'graded_at',      a.graded_at,
                            'status',         a.status,
                            'grading_status', CASE
                                WHEN a.graded_at IS NOT NULL        THEN 'graded'
                                WHEN a.status = 'completed'         THEN 'needs_grading'
                                WHEN a.status = 'active'            THEN 'in_progress'
                                ELSE                                     a.status
                            END
                        )
                        ORDER BY a.started_at DESC
                    ) FILTER (WHERE a.id IS NOT NULL),
                    '[]'
                ) AS attempts
 
            FROM       class_enrolments  ce
            JOIN       users             u  ON u.id          = ce.student_id
            LEFT JOIN  attempts          a  ON a.student_id  = u.id
                                          AND a.scenario_id  = $2
            WHERE      ce.class_id = $1
            GROUP BY   u.id, u.first_name, u.last_name, u.email
            ORDER BY   u.last_name, u.first_name`,
            [classId, scenarioId]
        );
 
        res.json(result.rows);
    } catch (err) {
        console.error('GET /api/grading/classes/:classId/scenarios/:scenarioId/students error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// GET /api/grading/attempts/:attemptId
// Return full detail for a single attempt
//Renders:
// - student info
// - all question and objective responses
// - running score

router.get('/attempts/:attemptId', authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;
        const { attemptId } = req.params;

        if (role !== 'teacher' && role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const attemptResult = await db.query(
            `SELECT
                a.id,
                a.status,
                a.started_at,
                a.completed_at,
                a.graded_at,
                u.id         AS student_id,
                u.first_name AS student_first_name,
                u.last_name  AS student_last_name,
                u.email      AS student_email,
                s.id         AS scenario_id,
                s.title      AS scenario_title
            FROM       attempts         a
            JOIN       users            u  ON u.id          = a.student_id
            JOIN       scenarios        s  ON s.id          = a.scenario_id
            JOIN       scenario_classes sc ON sc.scenario_id = s.id
            JOIN       classes          c  ON c.id          = sc.class_id
                                         AND c.teacher_id   = $2
            WHERE      a.id = $1
            LIMIT 1`,
            [attemptId, userId]
        );

        if (attemptResult.rows.length === 0) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const attempt = attemptResult.rows[0];

        // Fetch all question responses for this attempt
        const questionsResult = await db.query(
            `SELECT
                r.id              AS response_id,
                r.answer,
                r.score,
                r.grader_notes,
                r.submitted_at,
                r.updated_at,
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
            [attemptId]
        );


        // Fetch all objective responses for this attempt
        const objectivesResult = await db.query(
            `SELECT
                r.id              AS response_id,
                r.answer,
                r.score,
                r.is_correct,
                r.attempts_used,
                r.grader_notes,
                r.submitted_at,
                r.updated_at,
                o.id              AS objective_id,
                o.description,
                o.objective_type,
                o.order_index,
                o.max_score,
                o.correct_answer,
                o.max_attempts
            FROM   responses   r
            JOIN   objectives  o ON o.id = r.objective_id
            WHERE  r.attempt_id   = $1
            AND    r.objective_id IS NOT NULL
            AND    o.objective_type = 'side'
            ORDER BY o.order_index`,
            [attemptId]
        );

        // Compute running totals for this attempt, called by frontend
        const totalsResult = await db.query(
            `SELECT
                -- Sum of scores entered so far (NULLs excluded by SUM)
                COALESCE(SUM(r.score), 0)::float                         AS earned_score,
 
                -- Max possible: sum of max_score from all questions on this scenario
                -- plus sum of max_score from all side objectives on this scenario
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
                )::float                                                  AS max_score,
 
                -- Count how many scoreable responses still have no score
                COUNT(*) FILTER (WHERE r.score IS NULL)::int              AS unscored_count
 
            FROM responses r
            WHERE r.attempt_id = $1`,
            [attemptId]
        );
 
        const totals = totalsResult.rows[0];
 
        res.json({
            attempt,
            questions:  questionsResult.rows,
            objectives: objectivesResult.rows,
            totals: {
                earned_score:   totals.earned_score,
                max_score:      totals.max_score,
                unscored_count: totals.unscored_count,
                // Only compute the final percentage once everything is scored
                final_percentage: totals.unscored_count === 0 && totals.max_score > 0
                    ? Math.round((totals.earned_score / totals.max_score) * 100)
                    : null
            }
        });
    } catch (err) {
        console.error('GET /api/grading/attempts/:attemptId error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// PUT /api/grading/responses/:responseId
// Saves a score and grader_notes for a single response row
router.put('/attempts/:attemptId/responses/:responseId', authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;
        const { attemptId, responseId } = req.params;
        const { score, grader_notes } = req.body;
 
        if (role !== 'teacher' && role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }
 
        // Ownership check — confirm this attempt belongs to a scenario in a class
        // owned by this teacher. Same join pattern as the GET above.
        const ownerCheck = await db.query(
            `SELECT a.id
            FROM       attempts         a
            JOIN       scenarios        s  ON s.id          = a.scenario_id
            JOIN       scenario_classes sc ON sc.scenario_id = s.id
            JOIN       classes          c  ON c.id          = sc.class_id
                                         AND c.teacher_id   = $2
            WHERE      a.id = $1
            LIMIT 1`,
            [attemptId, userId]
        );
        if (ownerCheck.rows.length === 0) {
            return res.status(403).json({ message: 'Attempt not found or access denied' });
        }
 
        // Look up the max_score for this response so we can validate the incoming
        // score against it. A response points to either a question or an objective
        // (one of the two will be NULL), so we COALESCE across both joins.
        const maxScoreResult = await db.query(
            `SELECT
                r.id,
                COALESCE(q.max_score, o.max_score) AS max_score
            FROM       responses   r
            LEFT JOIN  questions   q ON q.id = r.question_id
            LEFT JOIN  objectives  o ON o.id = r.objective_id
            WHERE      r.id          = $1
            AND        r.attempt_id  = $2`,
            [responseId, attemptId]
        );
        if (maxScoreResult.rows.length === 0) {
            return res.status(404).json({ message: 'Response not found' });
        }
 
        const { max_score } = maxScoreResult.rows[0];
 
        // Validate score if one was provided. We allow null (teacher cleared a
        // draft score) but reject values outside 0..max_score.
        if (score !== null && score !== undefined) {
            if (typeof score !== 'number' || score < 0 || score > max_score) {
                return res.status(400).json({
                    message: `Score must be between 0 and ${max_score}`
                });
            }
        }
 
        // Write the score and notes. updated_at is refreshed so the teacher can
        // see when this response was last touched.
        const updateResult = await db.query(
            `UPDATE responses
            SET
                score        = $1,
                grader_notes = $2,
                updated_at   = NOW()
            WHERE id         = $3
            AND   attempt_id = $4
            RETURNING id, score, grader_notes, updated_at`,
            [score ?? null, grader_notes ?? null, responseId, attemptId]
        );
 
        res.json(updateResult.rows[0]);
    } catch (err) {
        console.error('PUT /api/grading/attempts/:attemptId/responses/:responseId error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// POST /api/grading/attempts/:attemptId/submit
router.post('/attempts/:attemptId/submit', authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;
        const { attemptId } = req.params;
 
        if (role !== 'teacher' && role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }
 
        // Ownership check
        const ownerCheck = await db.query(
            `SELECT a.id
            FROM       attempts         a
            JOIN       scenarios        s  ON s.id          = a.scenario_id
            JOIN       scenario_classes sc ON sc.scenario_id = s.id
            JOIN       classes          c  ON c.id          = sc.class_id
                                         AND c.teacher_id   = $2
            WHERE      a.id = $1
            LIMIT 1`,
            [attemptId, userId]
        );
        if (ownerCheck.rows.length === 0) {
            return res.status(403).json({ message: 'Attempt not found or access denied' });
        }
 
        // Count responses that still have no score. We only count question
        // responses and side objective responses — those are the ones that need
        // scores. Main objectives have no responses so they don't appear here.
        const unscoredResult = await db.query(
            `SELECT COUNT(*)::int AS unscored_count
            FROM  responses r
            WHERE r.attempt_id = $1
            AND   r.score      IS NULL`,
            [attemptId]
        );
 
        const { unscored_count } = unscoredResult.rows[0];
        if (unscored_count > 0) {
            return res.status(400).json({
                message: `Cannot submit: ${unscored_count} response${unscored_count > 1 ? 's' : ''} still need${unscored_count === 1 ? 's' : ''} a score`
            });
        }
 
        // All responses are scored — stamp graded_at and return the updated attempt
        const result = await db.query(
            `UPDATE attempts
            SET    graded_at = NOW()
            WHERE  id        = $1
            RETURNING id, status, graded_at`,
            [attemptId]
        );
 
        res.json(result.rows[0]);
    } catch (err) {
        console.error('POST /api/grading/attempts/:attemptId/submit error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});
 
 
module.exports = router;