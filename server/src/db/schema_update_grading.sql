-- ============================================================
-- DFIR Platform Migration
-- Objectives rework + unified responses table
-- ============================================================

BEGIN;

-- ── 1. Show any objectives that currently have a phase_id set ──
SELECT id, description, objective_type, phase_id
FROM objectives
WHERE phase_id IS NOT NULL;

-- ── 2. Add new columns to objectives ──────────────────────────
ALTER TABLE objectives
    ADD COLUMN IF NOT EXISTS correct_answer text,
    ADD COLUMN IF NOT EXISTS max_attempts   integer,
    ADD COLUMN IF NOT EXISTS max_score      numeric(5,2) DEFAULT 10 NOT NULL;

-- ── 3. Add max_score to questions ─────────────────────────────
ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS max_score numeric(5,2) DEFAULT 10 NOT NULL;

-- ── 4. Drop phase_id and blocks_progression from objectives ───
ALTER TABLE objectives
    DROP COLUMN IF EXISTS phase_id,
    DROP COLUMN IF EXISTS blocks_progression;

-- ── 5. Create the unified responses table ─────────────────────
CREATE TABLE IF NOT EXISTS responses (
    id            uuid DEFAULT gen_random_uuid() NOT NULL,
    attempt_id    uuid NOT NULL REFERENCES attempts(id)    ON DELETE CASCADE,
    student_id    uuid NOT NULL REFERENCES users(id),
    question_id   uuid          REFERENCES questions(id)   ON DELETE SET NULL,
    objective_id  uuid          REFERENCES objectives(id)  ON DELETE SET NULL,
    answer        text,
    score         numeric(5,2),
    is_correct    boolean,
    is_locked     boolean       DEFAULT false NOT NULL,
    attempts_used integer       DEFAULT 0     NOT NULL,
    submitted_at  timestamp without time zone DEFAULT now(),
    updated_at    timestamp without time zone DEFAULT now(),
    CONSTRAINT responses_pkey PRIMARY KEY (id),
    CONSTRAINT responses_source_check CHECK (
        (question_id IS NOT NULL AND objective_id IS NULL) OR
        (question_id IS NULL AND objective_id IS NOT NULL)
    )
);

-- ── 6. Drop the old submissions table ─────────────────────────
DROP TABLE IF EXISTS submissions;

COMMIT;