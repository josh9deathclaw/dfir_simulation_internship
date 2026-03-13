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
                     STRING_AGG(c.name, ', ' ORDER BY c.name) AS class_names,
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
                     STRING_AGG(DISTINCT c.name, ', ' ORDER BY c.name) AS class_name,
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
             JOIN classes          c  ON c.id = ce.class_id
             JOIN scenarios        s  ON s.class_id = c.id
             WHERE s.id = $1
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
                    (phase_id, title, description, file_type, file_path,
                    release_type, min_delay_minutes, max_delay_minutes,
                    guaranteed_release_minutes, notify_student)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [
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
            const realPhaseId = obj._phaseId ? (phaseIdMap[obj._phaseId] || null) : null;
 
            await client.query(
                `INSERT INTO objectives
                     (scenario_id, phase_id, description, objective_type,
                      blocks_progression, order_index)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    scenarioId,
                    realPhaseId,
                    obj.description.trim(),
                    obj.objective_type     || 'main',
                    obj.blocks_progression || false,
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
                     (phase_id, question_text, question_type,
                      blocks_progression, order_index)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    realPhaseId,
                    q.question_text.trim(),
                    q.question_type    || 'phase_question',
                    q.blocks_progression || false,
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

module.exports = router;