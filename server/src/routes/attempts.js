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
            `INSERT INTO attempts (student_id, scenario_id, status, started_at, scenario_time_units)
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

// ── POST /:id/injects/:injectId/extract — atomic narrative action processor ───
//
// Body: { action: 'full' | 'live', scenario_time_current: number }
//
// Implements the 7-step atomic processing spec:
//   1. VALIDATE
//   2. ADVANCE scenario_time
//   3. RECOMPUTE quality for all discovered-not-extracted injects
//   4. APPLY EXTRACTION (deliver file, fire evidence_extracted triggers)
//   5. CHECK time_elapsed triggers
//   6. REBUILD available actions (respecting time_budget)
//   7. RETURN new state
//
router.post('/:id/injects/:injectId/extract', authenticateToken, async (req, res) => {
    const { id: userId }  = req.user;
    const attemptId  = req.params.id;
    const injectId   = req.params.injectId;
    const { action, scenario_time_current } = req.body;

    if (!action || !['full', 'live'].includes(action)) {
        return res.status(400).json({ message: 'action must be "full" or "live"' });
    }
    if (scenario_time_current == null || typeof scenario_time_current !== 'number') {
        return res.status(400).json({ message: 'scenario_time_current (number) is required' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // ── Verify active attempt owned by this student ──────────────────────
        const attemptRes = await client.query(
            `SELECT a.id, a.scenario_time_units, p.time_budget, p.id AS phase_id
             FROM attempts a
             JOIN scenarios s ON s.id = a.scenario_id
             -- We need the phase for this inject to get the time_budget
             JOIN injects i ON i.id = $3
             JOIN phases p ON p.id = i.phase_id
             WHERE a.id = $1 AND a.student_id = $2 AND a.status = 'active'`,
            [attemptId, userId, injectId]
        );
        if (attemptRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Active attempt not found' });
        }
        const { time_budget } = attemptRes.rows[0];

        // ── Load the inject definition ───────────────────────────────────────
        const injectRes = await client.query(
            `SELECT id, lifespan_units, volatility,
                    extraction_cost_full, extraction_cost_live,
                    file_path, file_path_low_quality
             FROM injects WHERE id = $1`,
            [injectId]
        );
        if (injectRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Inject not found' });
        }
        const inject = injectRes.rows[0];

        // ── Load current inject state for this attempt ───────────────────────
        const stateRes = await client.query(
            `SELECT status, quality, scenario_time_at_discovery
             FROM attempt_inject_state
             WHERE attempt_id = $1 AND inject_id = $2`,
            [attemptId, injectId]
        );

        // ── STEP 1: VALIDATE ─────────────────────────────────────────────────
        if (stateRes.rows.length === 0 || stateRes.rows[0].status !== 'discovered') {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: 'Evidence is not in discovered state' });
        }

        const discoveredAt = stateRes.rows[0].scenario_time_at_discovery ?? 0;

        // Compute current quality before advancing time
        const currentQuality = computeQuality(inject, scenario_time_current, discoveredAt);
        if (currentQuality === 'destroyed') {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: 'Evidence has been destroyed' });
        }

        const actionCost = action === 'full'
            ? (inject.extraction_cost_full ?? 5)
            : (inject.extraction_cost_live ?? 2);

        if (scenario_time_current + actionCost > time_budget) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                message: 'Action would exceed phase time budget',
                time_budget,
                scenario_time_current,
                action_cost: actionCost,
            });
        }

        // ── STEP 2: ADVANCE SCENARIO TIME ────────────────────────────────────
        const newScenarioTime = scenario_time_current + actionCost;

        await client.query(
            `UPDATE attempts SET scenario_time_units = $1 WHERE id = $2`,
            [newScenarioTime, attemptId]
        );

        // ── STEP 3: RECOMPUTE QUALITY for all discovered-not-extracted injects
        // (done inline as we process each one in step 4 and 6)

        // ── STEP 4: APPLY EXTRACTION ─────────────────────────────────────────
        // Quality is computed at the NEW scenario time for extraction purposes.
        // live acquisition always extracts at low quality regardless.
        const qualityAtExtraction = action === 'live'
            ? 'low'
            : computeQuality(inject, newScenarioTime, discoveredAt);

        // Deliver the appropriate file to the VM
        const fileToDeliver = qualityAtExtraction === 'high'
            ? inject.file_path
            : inject.file_path_low_quality;

        // VM file delivery — fire and don't block (best-effort, same as existing pattern)
        if (fileToDeliver) {
            deliverFileToVM(attemptId, injectId, fileToDeliver).catch((err) =>
                console.error('VM file delivery error:', err)
            );
        }

        // Record extraction
        await client.query(
            `UPDATE attempt_inject_state
             SET status = 'extracted',
                 quality_at_extraction = $1,
                 extraction_method     = $2,
                 extracted_at_scenario_time = $3
             WHERE attempt_id = $4 AND inject_id = $5`,
            [qualityAtExtraction, action, newScenarioTime, attemptId, injectId]
        );

        // Fire evidence_extracted triggers: discover any injects that depend on this one
        const newlyDiscovered = [];

        const evtTriggersRes = await client.query(
            `SELECT t.inject_id
             FROM inject_triggers t
             WHERE t.trigger_type = 'evidence_extracted'
               AND t.ref_inject_id = $1
               AND t.inject_id IN (
                 SELECT i.id FROM injects i
                 WHERE i.phase_id = (SELECT phase_id FROM injects WHERE id = $1)
               )`,
            [injectId]
        );

        for (const row of evtTriggersRes.rows) {
            const alreadyKnown = await client.query(
                `SELECT id FROM attempt_inject_state
                 WHERE attempt_id = $1 AND inject_id = $2`,
                [attemptId, row.inject_id]
            );
            if (alreadyKnown.rows.length === 0) {
                await client.query(
                    `INSERT INTO attempt_inject_state
                         (attempt_id, inject_id, status, scenario_time_at_discovery)
                     VALUES ($1, $2, 'discovered', $3)`,
                    [attemptId, row.inject_id, newScenarioTime]
                );
                newlyDiscovered.push(row.inject_id);
            }
        }

        // ── STEP 5: CHECK time_elapsed TRIGGERS ──────────────────────────────
        const timeTriggersRes = await client.query(
            `SELECT t.inject_id, t.threshold_value
             FROM inject_triggers t
             WHERE t.trigger_type = 'time_elapsed'
               AND t.threshold_value <= $1
               AND t.inject_id IN (
                 SELECT i.id FROM injects i
                 WHERE i.phase_id = (SELECT phase_id FROM injects WHERE id = $2)
               )`,
            [newScenarioTime, injectId]
        );

        for (const row of timeTriggersRes.rows) {
            const alreadyKnown = await client.query(
                `SELECT id FROM attempt_inject_state
                 WHERE attempt_id = $1 AND inject_id = $2`,
                [attemptId, row.inject_id]
            );
            if (alreadyKnown.rows.length === 0) {
                await client.query(
                    `INSERT INTO attempt_inject_state
                         (attempt_id, inject_id, status, scenario_time_at_discovery)
                     VALUES ($1, $2, 'discovered', $3)`,
                    [attemptId, row.inject_id, newScenarioTime]
                );
                newlyDiscovered.push(row.inject_id);
            }
        }

        // ── STEP 6: REBUILD AVAILABLE ACTIONS ────────────────────────────────
        const budgetExhausted = newScenarioTime >= time_budget;

        // Load all inject states for this attempt (this phase)
        const allStatesRes = await client.query(
            `SELECT ais.inject_id, ais.status, ais.quality_at_extraction,
                    ais.scenario_time_at_discovery, ais.extraction_method,
                    i.lifespan_units, i.volatility,
                    i.extraction_cost_full, i.extraction_cost_live,
                    i.title
             FROM attempt_inject_state ais
             JOIN injects i ON i.id = ais.inject_id
             WHERE ais.attempt_id = $1`,
            [attemptId]
        );

        const allInjectStates = allStatesRes.rows.map((row) => {
            const q = row.status === 'discovered'
                ? computeQuality(
                    { lifespan_units: row.lifespan_units, volatility: row.volatility },
                    newScenarioTime,
                    row.scenario_time_at_discovery ?? 0
                  )
                : null;

            const actions = [];
            if (!budgetExhausted && row.status === 'discovered' && q !== 'destroyed') {
                actions.push({ type: 'full', cost: row.extraction_cost_full ?? 5 });
                actions.push({ type: 'live', cost: row.extraction_cost_live ?? 2 });
            }

            return {
                inject_id:         row.inject_id,
                title:             row.title,
                status:            row.status,
                current_quality:   q,
                quality_at_extraction: row.quality_at_extraction,
                extraction_method: row.extraction_method,
                actions,
            };
        });

        await client.query('COMMIT');

        // ── STEP 7: RETURN NEW STATE ──────────────────────────────────────────
        return res.json({
            scenario_time:     newScenarioTime,
            time_budget,
            budget_exhausted:  budgetExhausted,
            extracted_inject:  injectId,
            quality_delivered: qualityAtExtraction,
            file_delivered:    fileToDeliver || null,
            newly_discovered:  newlyDiscovered,
            all_inject_states: allInjectStates,
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('POST /api/attempts/:id/injects/:injectId/extract error:', err);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        client.release();
    }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute the quality of a discovered-not-extracted inject at a given scenario time.
 * Returns 'high' | 'low' | 'destroyed'.
 *
 * @param {object} inject   — { lifespan_units, volatility }
 * @param {number} scenarioTime — current scenario time
 * @param {number} discoveredAt — scenario_time_at_discovery
 */
function computeQuality(inject, scenarioTime, discoveredAt) {
    const { lifespan_units, volatility } = inject;

    if (!lifespan_units || volatility === 'none') return 'high';

    const elapsed   = scenarioTime - discoveredAt;
    const degradeMult = volatility === 'high' ? 0.25 : 0.5;
    const degradeAt   = lifespan_units * degradeMult;
    const destroyAt   = lifespan_units;

    if (elapsed >= destroyAt) return 'destroyed';
    if (elapsed >= degradeAt) return 'low';
    return 'high';
}

/**
 * Deliver a file from server storage into the student's VM container.
 * Reuses the same approach as the existing vm/inject route — delegated here
 * so the extract route stays synchronous while the delivery happens in the
 * background.  Replace the body with the real VM API call if needed.
 */
async function deliverFileToVM(attemptId, injectId, filePath) {
    const vmRes = await db.query(
        `SELECT host_port FROM vm_instances WHERE attempt_id = $1 AND status = 'running'`,
        [attemptId]
    );
    if (vmRes.rows.length === 0) return; // no VM running — skip silently

    // The existing /api/vm/inject/:attemptId route handles the actual noVNC
    // file push; replicate that logic here or call an internal helper.
    // Stubbed — replace with real implementation if vm module is extracted.
    console.log(`[deliverFileToVM] attempt=${attemptId} inject=${injectId} file=${filePath}`);
}

module.exports = router;