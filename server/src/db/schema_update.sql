ALTER TABLE scenarios
    ADD COLUMN IF NOT EXISTS estimated_time_minutes INTEGER;

ALTER TABLE phases
    ADD COLUMN IF NOT EXISTS duration_minutes      INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS requires_completion   BOOLEAN NOT NULL DEFAULT FALSE;
-- requires_completion: if true, the next phase will only unlock after the current phase is marked as completed by the teacher. If false, the next phase will unlock after the specified unlock_time_minutes has passed.

ALTER TABLE injects
    ALTER COLUMN phase_id DROP NOT NULL;

ALTER TABLE injects
    ADD COLUMN IF NOT EXISTS release_type VARCHAR(30) NOT NULL DEFAULT 'random_in_phase'
            CHECK (release_type IN (
                'random_in_phase',        -- random drop within min/max window of its phase
                'guaranteed_in_phase',    -- drops at guaranteed_release_minutes after phase start
                'random_in_scenario',     -- no phase — random across entire scenario duration
                'guaranteed_in_scenario'  -- no phase — drops at exact minute from scenario start
            )),
        ADD COLUMN IF NOT EXISTS guaranteed_release_minutes INTEGER DEFAULT NULL,
        -- Used when release_type is 'guaranteed_in_phase' or 'guaranteed_in_scenario'
        ADD COLUMN IF NOT EXISTS notify_student BOOLEAN NOT NULL DEFAULT TRUE;
        -- Whether to show the student a notification when this inject is released
    
ALTER TABLE objectives
    ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES phases(id) ON DELETE CASCADE,
    -- NULL = scenario-level objective (shown throughout / end of scenario)
    -- SET  = belongs to a specific phase
    ADD COLUMN IF NOT EXISTS objective_type VARCHAR(10) NOT NULL DEFAULT 'main'
        CHECK (objective_type IN ('main', 'side')),
    ADD COLUMN IF NOT EXISTS blocks_progression BOOLEAN NOT NULL DEFAULT FALSE,
    -- If TRUE, student must complete this before next phase unlocks
    ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;

-- Allow questions to have no phase (end-of-scenario questions)
ALTER TABLE questions
    ALTER COLUMN phase_id DROP NOT NULL;

ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS question_type    VARCHAR(25) NOT NULL DEFAULT 'phase_question'
        CHECK (question_type IN ('phase_question', 'end_of_scenario')),
    ADD COLUMN IF NOT EXISTS blocks_progression BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS order_index      INTEGER NOT NULL DEFAULT 0;

-- Scenario Classes Junction Table (many to many relationship)
CREATE TABLE IF NOT EXISTS scenario_classes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    class_id    UUID NOT NULL REFERENCES classes(id)   ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(scenario_id, class_id)
);

-- Migrate existing data from scenarios.class_id into the junction table
-- (safe to run even if class_id column has already been dropped)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'scenarios' AND column_name = 'class_id'
    ) THEN
        INSERT INTO scenario_classes (scenario_id, class_id)
        SELECT id, class_id
        FROM scenarios
        WHERE class_id IS NOT NULL
        ON CONFLICT (scenario_id, class_id) DO NOTHING;
    END IF;
END $$;

-- Now drop the old class_id column from scenarios
ALTER TABLE scenarios
    DROP COLUMN IF EXISTS class_id;
