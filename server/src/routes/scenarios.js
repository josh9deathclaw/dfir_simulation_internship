const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

//Teacher reutrns all scenarios
//Student returns only published scenarios for classes they are enrolled in
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;

        let rows;

        if (role === 'teacher' || role === 'admin') {
            // Teachers see all scenarios plus the owning class name and attempt count
            rows = await db.query(
                `SELECT
                     s.id,
                     s.title,
                     s.description,
                     s.difficulty,
                     s.is_published,
                     s.created_by,
                     s.created_at,
                     s.estimated_time_minutes,
                     -- Aggregate class names since scenario can belong to many classes
                     JSON_AGG(DISTINCT c.name) AS class_names,
                     COUNT(a.id)::int AS attempt_count
                 FROM scenarios s
                 LEFT JOIN scenario_classes sc ON sc.scenario_id = s.id
                 LEFT JOIN classes c ON c.id = sc.class_id
                 LEFT JOIN attempts a ON a.scenario_id = s.id
                 GROUP BY s.id
                 ORDER BY s.created_at DESC`,
            );
        } else {
            // Students only see published scenarios for classes they are enrolled in
            rows = await db.query(
                `SELECT
                     s.id,
                     s.title,
                     s.description,
                     s.difficulty,
                     s.is_published,
                     s.created_by,
                     s.created_at,
                     s.estimated_time_minutes,
                     JSON_AGG(DISTINCT c.name) AS class_names,
                     COUNT(a.id)::int AS attempt_count
                 FROM scenarios s
                 JOIN scenario_classes sc ON sc.scenario_id = s.id
                 JOIN classes c ON c.id = sc.class_id
                 JOIN class_enrolments ce ON ce.class_id   = c.id
                                        AND ce.student_id  = $1
                 LEFT JOIN attempts    a  ON a.scenario_id = s.id
                                        AND a.student_id   = $1
                 WHERE s.is_published = TRUE
                 GROUP BY s.id
                 ORDER BY s.created_at DESC`,
                [userId],
            );
        }

        res.json(rows.rows);
    } catch (err) {
        console.error('GET /api/scenarios error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

//Teacher Only: returns students enrolled in class for this scenario
router.get('/:id/students', authenticateToken, async (req, res) => {
    try {
        const { role } = req.user;
        if (role !== 'teacher' && role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const { rows } = await db.query(
            `SELECT
                 u.id,
                 u.first_name,
                 u.last_name,
                 u.email
             FROM users u
             JOIN class_enrolments ce ON ce.student_id = u.id
             JOIN scenario_classes sc ON sc.class_id = ce.class_id
             WHERE sc.scenario_id = $1
             ORDER BY u.last_name, u.first_name`,
            [req.params.id],
        );

        res.json(rows);
    } catch (err) {
        console.error('GET /api/scenarios/:id/students error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Create a full scenario with all details and class associations in one request
router.post('/', authenticateToken, async (req, res) => {
    const {role, id: userId} = req.user;
    if (role !== 'teacher' && role !== 'admin') {
        return res.status(403).json({message: 'Forbidden'});
    }
    
    const {
        title, 
        description,
        difficulty,
        estimated_time_minutes,
        class_ids = [],
        phases = [],
        injects =[],
        objectives = [],
        questions = [],
    } = req.body;

    // Validation
        if (!title?.trim())     return res.status(400).json({ message: 'Title is required' });
    if (!difficulty)        return res.status(400).json({ message: 'Difficulty is required' });
    if (!class_ids.length)  return res.status(400).json({ message: 'At least one class must be selected' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // Create Scenario
        const scenarioResult = await client.query(
            `INSERT INTO scenarios
                 (title, description, difficulty, created_by, estimated_time_minutes, is_published)
             VALUES ($1, $2, $3, $4, $5, FALSE)
             RETURNING id`,
            [
                title.trim(),
                description || null,
                difficulty,
                userId,
                estimated_time_minutes || null,
            ]
        );
        const scenarioId = scenarioResult.rows[0].id;

        const scenarioDir = path.join(__dirname, "../../uploads/scenarios", String(scenarioId));
        await fs.promises.mkdir(scenarioDir, { recursive: true });

        // Associate with Classes
        for (const classId of class_ids) {
            await client.query(
                `INSERT INTO scenario_classes (scenario_id, class_id) 
                VALUES ($1, $2) 
                ON CONFLICT (scenario_id, class_id) DO NOTHING`,
                [scenarioId, classId]
            );
        }
        
        // Insert Phases
        const phaseIdMap = {}; // temp _id → real DB UUID
 
        for (const phase of phases) {
            const phaseRes = await client.query(
                `INSERT INTO phases
                     (scenario_id, title, description, order_index,
                      duration_minutes, unlock_time_minutes, requires_completion)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id`,
                [
                    scenarioId,
                    phase.title.trim(),
                    phase.description || null,
                    phase.order_index,
                    phase.duration_minutes || 30,
                    phase.order_index === 0 ? 0 : null,  // first phase unlocks at t=0
                    phase.requires_completion || false,
                ]
            );
            phaseIdMap[phase._id] = phaseRes.rows[0].id;
        }

        const fileMoves = []; // track file moves to perform after DB inserts
 
        console.log("Injects received:", injects);

        // Insert injects
        // injects have _phaseId (temp) or null for free-roaming
        for (const inject of injects) {

            const guaranteedMinutes = inject.guaranteed_release_minutes !== ""
                ? parseInt(inject.guaranteed_release_minutes)
                : null;

            let newFilePath = null;

            if (inject.file_path) {

                const filename = path.basename(inject.file_path);
                const oldPath = path.join(__dirname, "../../", inject.file_path);
                const newPath = path.join(scenarioDir, filename);

                newFilePath = `uploads/scenarios/${scenarioId}/${filename}`;

                fileMoves.push({
                    oldPath,
                    newPath,
                });
            }

            const realPhaseId = inject._phaseId ? (phaseIdMap[inject._phaseId] || null) : null;

            await client.query(
                `INSERT INTO injects
                    (scenario_id, phase_id, title, description, file_type, file_path,
                    release_type, min_delay_minutes, max_delay_minutes,
                    guaranteed_release_minutes, notify_student)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [
                    scenarioId,
                    realPhaseId,
                    inject.title.trim(),
                    inject.description || null,
                    inject.file_type || null,
                    newFilePath,
                    inject.release_type,
                    inject.min_delay_minutes ?? 0,
                    inject.max_delay_minutes ?? 10,
                    guaranteedMinutes,
                    inject.notify_student !== false,
                ]
            );
        }
 
        // Insert objectives
        for (let i = 0; i < objectives.length; i++) {
            const obj = objectives[i];
            await client.query(
                `INSERT INTO objectives
                     (scenario_id, description, objective_type,
                      max_score, correct_answer, max_attempts, order_index)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    scenarioId,
                    obj.description.trim(),
                    ['main', 'side'].includes(obj.objective_type) ? obj.objective_type : 'main',
                    obj.objective_type === 'side' ? (parseFloat(obj.max_score) || 10) : null,
                    obj.objective_type === 'side' && obj.correct_answer?.trim() ? obj.correct_answer.trim() : null,
                    obj.objective_type === 'side' && obj.max_attempts ? parseInt(obj.max_attempts) : null,
                    i,
                ]
            );
        }
 
        // Insert questions
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const realPhaseId = q._phaseId ? (phaseIdMap[q._phaseId] || null) : null;
            await client.query(
                `INSERT INTO questions
                     (scenario_id, phase_id, question_text, question_type,
                      blocks_progression, max_score, order_index)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    scenarioId,
                    realPhaseId,
                    q.question_text.trim(),
                    q.question_type || 'phase_question',
                    q.blocks_progression || false,
                    parseFloat(q.max_score) || 10,
                    i,
                ]
            );
        }
 
        await client.query('COMMIT');

        //MOVE FILES after successful DB transaction
        for (const move of fileMoves) {
            await fs.promises.rename(move.oldPath, move.newPath);
        }

        res.status(201).json({ id: scenarioId, message: 'Scenario created successfully' });
 
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('POST /api/scenarios error:', err);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        client.release();
    }
});

// Publish Scenario
router.patch('/:id/publish', authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;
        if (role !== 'teacher' && role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }
 
        const scenarioRes = await db.query(
            'SELECT created_by, is_published FROM scenarios WHERE id = $1',
            [req.params.id]
        );
        if (scenarioRes.rows.length === 0) {
            return res.status(404).json({ message: 'Scenario not found' });
        }
        if (role !== 'admin' && scenarioRes.rows[0].created_by !== userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }
 
        const current = scenarioRes.rows[0].is_published;
        await db.query(
            'UPDATE scenarios SET is_published = $1 WHERE id = $2',
            [!current, req.params.id]
        );
 
        res.json({ is_published: !current });
    } catch (err) {
        console.error('PATCH /api/scenarios/:id/publish error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get scenario details for editing and for simulator page (includes phases, injects, objectives, questions)
router.get('/:id/full', authenticateToken, async (req, res) => {
    const {id: scenarioId} = req.params;
    const {id: userId, role} = req.user;

    try {

        // Check if scenario exists and if user has access
        const scenarioRes = await db.query(
            `SELECT s.id, s.title, s.description, s.difficulty,
                    s.estimated_time_minutes, s.is_published, s.created_by
             FROM scenarios s
             WHERE s.id = $1`,
            [scenarioId]
        );

        if (scenarioRes.rows.length === 0) {
            return res.status(404).json({ message: 'Scenario not found' });
        }

        const scenario = scenarioRes.rows[0];

        // Access check
        if (role === 'student') {
            // Student must be enrolled in a class this scenario is assigned to
            const accessRes = await db.query(
                `SELECT 1 FROM scenario_classes sc
                 JOIN class_enrolments ce ON ce.class_id = sc.class_id
                 WHERE sc.scenario_id = $1 AND ce.student_id = $2`,
                [scenarioId, userId]
            );
            if (accessRes.rows.length === 0) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        } else if (role === 'teacher') {
            if (scenario.created_by !== userId) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        // Fetch Phases
        const phasesRes = await db.query(
            `SELECT id, title, description, order_index,
                    duration_minutes, requires_completion
             FROM phases
             WHERE scenario_id = $1
             ORDER BY order_index ASC`,
            [scenarioId]
        )

        // Fetch Injects
        const injectsRes = await db.query(
            `SELECT id, phase_id, title, description, file_path, file_type,
                    release_type, min_delay_minutes,
                    max_delay_minutes, guaranteed_release_minutes, notify_student
             FROM injects
             WHERE scenario_id = $1`,
            [scenarioId]
        );

        // Fetch Objectives
        const objectivesRes = await db.query(
            `SELECT id, description, objective_type,
                    max_score, correct_answer, max_attempts, order_index
             FROM objectives
             WHERE scenario_id = $1
             ORDER BY order_index ASC`,
            [scenarioId]
        );

        // Fetch Questions
        const questionsRes = await db.query(
            `SELECT id, phase_id, question_text, question_type,
                    blocks_progression, max_score, order_index
             FROM questions
             WHERE scenario_id = $1
             ORDER BY order_index ASC`,
            [scenarioId]
        );

        // Assemble and Return
        res.json({
            scenario,
            phases:     phasesRes.rows,
            injects:    injectsRes.rows,
            objectives: objectivesRes.rows,
            questions:  questionsRes.rows,
        });

    } catch (err) {
        console.error('GET /api/scenarios/:id/full error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Returns class IDs (and names) assigned to a scenario — used to pre-fill the edit form
router.get('/:id/classes', authenticateToken, async (req, res) => {
    try {
        const { role, id: userId } = req.user;
        if (role !== 'teacher' && role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const scenarioRes = await db.query(
            'SELECT created_by FROM scenarios WHERE id = $1',
            [req.params.id]
        );
        if (scenarioRes.rows.length === 0) {
            return res.status(404).json({ message: 'Scenario not found' });
        }
        if (role !== 'admin' && scenarioRes.rows[0].created_by !== userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const { rows } = await db.query(
            `SELECT c.id, c.name
             FROM classes c
             JOIN scenario_classes sc ON sc.class_id = c.id
             WHERE sc.scenario_id = $1
             ORDER BY c.name`,
            [req.params.id]
        );

        res.json(rows);
    } catch (err) {
        console.error('GET /api/scenarios/:id/classes error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Edit a scenario (teacher only, auto-unpublishes on save)
router.put('/:id', authenticateToken, async (req, res) => {
    const { role, id: userId } = req.user;
    if (role !== 'teacher' && role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden' });
    }

    const {
        title,
        description,
        difficulty,
        estimated_time_minutes,
        class_ids = [],
        phases = [],
        injects = [],
        objectives = [],
        questions = [],
    } = req.body;

    if (!title?.trim())    return res.status(400).json({ message: 'Title is required' });
    if (!difficulty)       return res.status(400).json({ message: 'Difficulty is required' });
    if (!class_ids.length) return res.status(400).json({ message: 'At least one class must be selected' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // Ownership check
        const scenarioRes = await client.query(
            'SELECT created_by FROM scenarios WHERE id = $1',
            [req.params.id]
        );
        if (scenarioRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Scenario not found' });
        }
        if (role !== 'admin' && scenarioRes.rows[0].created_by !== userId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Forbidden' });
        }

        const scenarioId = req.params.id;

        // Update scenario row, always unpublish on edit
        await client.query(
            `UPDATE scenarios
             SET title = $1, description = $2, difficulty = $3,
                 estimated_time_minutes = $4, is_published = FALSE
             WHERE id = $5`,
            [title.trim(), description || null, difficulty, estimated_time_minutes || null, scenarioId]
        );

        // Re-sync class associations
        await client.query('DELETE FROM scenario_classes WHERE scenario_id = $1', [scenarioId]);
        for (const classId of class_ids) {
            await client.query(
                `INSERT INTO scenario_classes (scenario_id, class_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [scenarioId, classId]
            );
        }

        // Delete all existing child records including scenario-level ones (phase_id = NULL)
        await client.query('DELETE FROM questions WHERE scenario_id = $1', [scenarioId]);
        await client.query('DELETE FROM injects WHERE scenario_id = $1', [scenarioId]);
        await client.query('DELETE FROM objectives WHERE scenario_id = $1', [scenarioId]);
        await client.query('DELETE FROM phases WHERE scenario_id = $1', [scenarioId]);

        // Re-insert phases
        const phaseIdMap = {};
        for (const phase of phases) {
            const phaseRes = await client.query(
                `INSERT INTO phases
                     (scenario_id, title, description, order_index,
                      duration_minutes, unlock_time_minutes, requires_completion)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id`,
                [
                    scenarioId,
                    phase.title.trim(),
                    phase.description || null,
                    phase.order_index,
                    phase.duration_minutes || 30,
                    phase.order_index === 0 ? 0 : null,
                    phase.requires_completion || false,
                ]
            );
            phaseIdMap[phase._id] = phaseRes.rows[0].id;
        }

        const scenarioDir = path.join(__dirname, "../../uploads/scenarios", String(scenarioId));
        await fs.promises.mkdir(scenarioDir, { recursive: true });
        const fileMoves = [];

        // Re-insert injects
        for (const inject of injects) {
            const guaranteedMinutes = inject.guaranteed_release_minutes !== ""
                ? parseInt(inject.guaranteed_release_minutes)
                : null;

            let newFilePath = null;
            if (inject.file_path) {
                const filename = path.basename(inject.file_path);
                const oldPath = path.join(__dirname, "../../", inject.file_path);
                const newPath = path.join(scenarioDir, filename);
                newFilePath = `uploads/scenarios/${scenarioId}/${filename}`;
                fileMoves.push({ oldPath, newPath });
            }

            const realPhaseId = inject._phaseId ? (phaseIdMap[inject._phaseId] || null) : null;
            await client.query(
                `INSERT INTO injects
                    (scenario_id, phase_id, title, description, file_type, file_path,
                     release_type, min_delay_minutes, max_delay_minutes,
                     guaranteed_release_minutes, notify_student)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [
                    scenarioId,
                    realPhaseId,
                    inject.title.trim(),
                    inject.description || null,
                    inject.file_type || null,
                    newFilePath,
                    inject.release_type,
                    inject.min_delay_minutes ?? 0,
                    inject.max_delay_minutes ?? 10,
                    guaranteedMinutes,
                    inject.notify_student !== false,
                ]
            );
        }

        // Re-insert objectives
        for (let i = 0; i < objectives.length; i++) {
            const obj = objectives[i];
            await client.query(
                `INSERT INTO objectives
                    (scenario_id, description, objective_type,
                        max_score, correct_answer, max_attempts, order_index)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    scenarioId,
                    obj.description.trim(),
                    ['main', 'side'].includes(obj.objective_type) ? obj.objective_type : 'main',

                    obj.objective_type === 'side' ? (parseFloat(obj.max_score) || 10) : 0, // ✅ FIX

                    obj.objective_type === 'side' && obj.correct_answer?.trim()
                        ? obj.correct_answer.trim()
                        : null,

                    obj.objective_type === 'side' && obj.max_attempts
                        ? parseInt(obj.max_attempts)
                        : null,

                    i,
                ]
            );
        }

        // Re-insert questions
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const realPhaseId = q._phaseId ? (phaseIdMap[q._phaseId] || null) : null;
            await client.query(
                `INSERT INTO questions
                     (scenario_id, phase_id, question_text, question_type,
                      blocks_progression, max_score, order_index)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [scenarioId, realPhaseId, q.question_text.trim(), q.question_type || 'phase_question', q.blocks_progression || false, parseFloat(q.max_score) || 10, i]
            );
        }

        await client.query('COMMIT');

        for (const move of fileMoves) {
            try { await fs.promises.rename(move.oldPath, move.newPath); } catch (_) {}
        }

        res.json({ id: scenarioId, message: 'Scenario updated successfully' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('PUT /api/scenarios/:id error:', err);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        client.release();
    }
});


// ─── Responses (unified question + objective answers) ─────────────────────────

// POST /api/responses — save a student's answer for a question or objective
router.post('/responses', authenticateToken, async (req, res) => {
    const { id: studentId } = req.user;
    const { attempt_id, question_id, objective_id, answer } = req.body;

    if (!attempt_id) return res.status(400).json({ message: 'attempt_id is required' });
    if (!question_id && !objective_id) return res.status(400).json({ message: 'question_id or objective_id is required' });
    if (question_id && objective_id) return res.status(400).json({ message: 'Provide only one of question_id or objective_id' });

    try {
        // If objective, check attempt limit and auto-score if correct_answer set
        let is_correct = null;
        let score = null;
        let attempts_used = 0;

        if (objective_id) {
            const objRes = await db.query(
                'SELECT correct_answer, max_attempts, max_score FROM objectives WHERE id = $1',
                [objective_id]
            );
            if (objRes.rows.length === 0) return res.status(404).json({ message: 'Objective not found' });
            const obj = objRes.rows[0];

            // Check existing response for this objective/attempt
            const existing = await db.query(
                'SELECT id, attempts_used, is_locked FROM responses WHERE attempt_id = $1 AND objective_id = $2',
                [attempt_id, objective_id]
            );

            if (existing.rows.length > 0) {
                const row = existing.rows[0];
                if (row.is_locked) return res.status(403).json({ message: 'This objective is locked and cannot be changed' });
                attempts_used = row.attempts_used + 1;
                if (obj.max_attempts && attempts_used > obj.max_attempts) {
                    return res.status(403).json({ message: 'Maximum attempts reached' });
                }
            } else {
                attempts_used = 1;
            }

            // Auto-score if correct_answer set — case-insensitive contains check
            if (obj.correct_answer) {
                const normalAnswer  = (answer || '').toLowerCase().trim();
                const normalCorrect = obj.correct_answer.toLowerCase().trim();
                is_correct = normalAnswer.includes(normalCorrect) || normalCorrect.includes(normalAnswer);
                score = is_correct ? (obj.max_score || 10) : 0;
            }

            // Lock if max_attempts reached
            const is_locked = obj.max_attempts ? attempts_used >= obj.max_attempts : false;

            if (existing.rows.length > 0) {
                // Update existing response
                await db.query(
                    `UPDATE responses
                     SET answer = $1, is_correct = $2, score = $3,
                         attempts_used = $4, is_locked = $5, updated_at = now()
                     WHERE id = $6`,
                    [answer, is_correct, score, attempts_used, is_locked, existing.rows[0].id]
                );
                return res.json({ id: existing.rows[0].id, is_correct, score, attempts_used, is_locked });
            }

            // Insert new response
            const result = await db.query(
                `INSERT INTO responses
                     (attempt_id, student_id, objective_id, answer,
                      is_correct, score, attempts_used, is_locked)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id`,
                [attempt_id, studentId, objective_id, answer, is_correct, score, attempts_used, is_locked]
            );
            return res.status(201).json({ id: result.rows[0].id, is_correct, score, attempts_used, is_locked });
        }

        // Question response — just save, no auto-scoring
        const existing = await db.query(
            'SELECT id FROM responses WHERE attempt_id = $1 AND question_id = $2',
            [attempt_id, question_id]
        );

        if (existing.rows.length > 0) {
            await db.query(
                `UPDATE responses SET answer = $1, updated_at = now() WHERE id = $2`,
                [answer, existing.rows[0].id]
            );
            return res.json({ id: existing.rows[0].id });
        }

        const result = await db.query(
            `INSERT INTO responses (attempt_id, student_id, question_id, answer)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [attempt_id, studentId, question_id, answer]
        );
        res.status(201).json({ id: result.rows[0].id });

    } catch (err) {
        console.error('POST /api/scenarios/responses error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// GET /api/responses?attempt_id=x — load all responses for an attempt (for resume)
router.get('/responses', authenticateToken, async (req, res) => {
    const { attempt_id } = req.query;
    if (!attempt_id) return res.status(400).json({ message: 'attempt_id is required' });

    try {
        const { rows } = await db.query(
            `SELECT id, question_id, objective_id, answer,
                    is_correct, score, attempts_used, is_locked
             FROM responses
             WHERE attempt_id = $1`,
            [attempt_id]
        );
        res.json(rows);
    } catch (err) {
        console.error('GET /api/scenarios/responses error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// PATCH /api/responses/:id — teacher updates score during grading
router.patch('/responses/:id', authenticateToken, async (req, res) => {
    const { role } = req.user;
    if (role !== 'teacher' && role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden' });
    }
    const { score } = req.body;
    if (score === undefined || score === null) return res.status(400).json({ message: 'score is required' });

    try {
        const result = await db.query(
            `UPDATE responses SET score = $1, updated_at = now() WHERE id = $2 RETURNING id`,
            [parseFloat(score), req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Response not found' });
        res.json({ id: result.rows[0].id, score: parseFloat(score) });
    } catch (err) {
        console.error('PATCH /api/scenarios/responses/:id error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;