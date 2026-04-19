\const VOLATILITY_THRESHOLDS = {
  high: { lowQualityAfter: 60 },    // >60 min → low quality
  average: { lowQualityAfter: 180 }, // >180 min → low quality
  none: null                          // never degrades
};

function computeQuality(inject, discoveredAtMinutes, currentScenarioMinutes) {
  const threshold = VOLATILITY_THRESHOLDS[inject.volatility];
  if (!threshold) return 'high';
  const elapsed = currentScenarioMinutes - discoveredAtMinutes;
  return elapsed > threshold.lowQualityAfter ? 'low' : 'high';
}

async function processDecisionChoice(attemptId, decisionId, chosenOptionId, db) {
  const attempt = await db.query(
    'SELECT scenario_time_minutes FROM attempts WHERE id=$1', [attemptId]
  );
  const scenarioTime = attempt.rows[0].scenario_time_minutes;

  const option = await db.query(
    'SELECT * FROM decision_options WHERE id=$1', [chosenOptionId]
  );
  const opt = option.rows[0];

  // Advance scenario time by the decision's cost
  const decision = await db.query(
    'SELECT time_cost_minutes FROM decisions WHERE id=$1', [decisionId]
  );
  const newTime = scenarioTime + decision.rows[0].time_cost_minutes;
  await db.query(
    'UPDATE attempts SET scenario_time_minutes=$1 WHERE id=$2', [newTime, attemptId]
  );

  // Apply inject effect if any
  if (opt.inject_effect && opt.inject_id) {
    if (opt.inject_effect === 'unlock') {
      // Discover the inject — calculate quality at discovery time
      const injectRow = await db.query('SELECT * FROM injects WHERE id=$1', [opt.inject_id]);
      const quality = computeQuality(injectRow.rows[0], newTime, newTime); // just discovered
      await db.query(`
        INSERT INTO attempt_inject_state (attempt_id, inject_id, status, quality, discovered_at_scenario_time)
        VALUES ($1,$2,'discovered',$3,$4)
        ON CONFLICT (attempt_id, inject_id) DO UPDATE SET status='discovered', quality=$3
      `, [attemptId, opt.inject_id, quality, newTime]);
    } else if (opt.inject_effect === 'lock') {
      await db.query(`
        UPDATE attempt_inject_state SET status='hidden'
        WHERE attempt_id=$1 AND inject_id=$2
      `, [attemptId, opt.inject_id]);
    }
  }

  // Re-evaluate quality of all currently discovered (not yet extracted) injects
  // Time has advanced, so some may have degraded
  const discovered = await db.query(`
    SELECT ais.*, i.volatility FROM attempt_inject_state ais
    JOIN injects i ON ais.inject_id = i.id
    WHERE ais.attempt_id=$1 AND ais.status='discovered'
  `, [attemptId]);

  for (const row of discovered.rows) {
    const newQuality = computeQuality(row, row.discovered_at_scenario_time, newTime);
    if (newQuality !== row.quality) {
      await db.query(
        'UPDATE attempt_inject_state SET quality=$1 WHERE id=$2',
        [newQuality, row.id]
      );
    }
  }

  // Log the decision
  await db.query(`
    INSERT INTO attempt_decisions (attempt_id, decision_id, chosen_option_id, scenario_time_at_choice)
    VALUES ($1,$2,$3,$4)
  `, [attemptId, decisionId, chosenOptionId, newTime]);

  return { newScenarioTime: newTime, outcomeText: opt.outcome_text, scoreDelta: opt.score_delta };
}