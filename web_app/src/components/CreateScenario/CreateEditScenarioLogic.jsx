// src/components/ScenarioEditor/CreateEditScenarioLogic.jsx
import React from "react";
import PhaseCard from "../CreateScenario/PhaseCard";
import ScenarioLevelSection from "../CreateScenario/ScenarioLevelSection";
import NarrativePhaseCard from "./NarrativePhaseCard";

// ─── uid ──────────────────────────────────────────────────────────────────────
export function uid() {
    return Math.random().toString(36).slice(2, 10);
}

// ─── Factories ────────────────────────────────────────────────────────────────
export function newPhase() {
    return {
        _id: uid(),
        title: "", description: "",
        duration_minutes: 30,
        time_budget: 30,          // narrative: scenario-time unit hard cap per phase
        requires_completion: false,
        expanded: true,
        injects: [], objectives: [], questions: [],
    };
}

export function newInject(releaseType = "random_in_phase") {
    return {
        _id: uid(),
        title: "", description: "",
        file_name: "", file_type: "", file_size: null,
        file_path: "", file_obj: null, upload_status: "idle",
        // Primary file used when quality is high (or always for open-ended)
        // Low-quality version delivered when evidence has degraded
        file_path_low_quality: "",
        file_name_low_quality: "", file_size_low_quality: null,
        file_type_low_quality: "", upload_status_low_quality: "idle",
        // Open-ended release fields (unused in narrative, kept on table)
        release_type: releaseType,
        min_delay_minutes: 0, max_delay_minutes: 10,
        guaranteed_release_minutes: "",
        notify_student: true,
        // Narrative volatility fields
        lifespan_units: "",        // scenario-time units before evidence is destroyed
        volatility: "none",        // 'none' | 'average' | 'high'
        // Narrative acquisition costs (scenario-time units)
        extraction_cost_full: 5,
        extraction_cost_live: 2,
        // Narrative trigger (one per inject)
        trigger_type: "always",           // 'always' | 'time_elapsed' | 'evidence_extracted'
        trigger_threshold: "",            // used when trigger_type === 'time_elapsed'
        trigger_ref_inject_id: "",        // used when trigger_type === 'evidence_extracted'
    };
}

export function newObjective() {
    return {
        _id: uid(), description: "", objective_type: "main",
        max_score: 10, correct_answer: "", max_attempts: "",
    };
}

export function newQuestion(type = "phase_question") {
    return {
        _id: uid(), question_text: "",
        blocks_progression: false, question_type: type, max_score: 10,
    };
}

// ─── Quality threshold helpers (shared between editor and simulator) ──────────

/**
 * Returns { degradeAt: number|null, destroyAt: number|null } in scenario-time units.
 * Both null when volatility === 'none'.
 */
export function computeThresholds(lifespan_units, volatility) {
    if (!lifespan_units || volatility === "none") return { degradeAt: null, destroyAt: null };
    const mult = volatility === "high" ? 0.25 : 0.5;
    return {
        degradeAt: Math.round(lifespan_units * mult),
        destroyAt: lifespan_units,
    };
}

/**
 * Returns 'high' | 'low' | 'destroyed' for a discovered inject at a given
 * scenario time.  elapsed = scenarioTime - discoveredAt.
 */
export function computeQuality(inject, scenarioTime, discoveredAt = 0) {
    const { lifespan_units, volatility } = inject;
    if (!lifespan_units || volatility === "none") return "high";
    const elapsed = scenarioTime - discoveredAt;
    const { degradeAt, destroyAt } = computeThresholds(lifespan_units, volatility);
    if (elapsed >= destroyAt) return "destroyed";
    if (elapsed >= degradeAt) return "low";
    return "high";
}

// ─── Primitive UI components ──────────────────────────────────────────────────
export function Field({ label, required, hint, children }) {
    return (
        <div className="cs-field">
            {label && (
                <label className="cs-label">
                    {label}{required && <span className="cs-req">*</span>}
                </label>
            )}
            {children}
            {hint && <span className="cs-hint">{hint}</span>}
        </div>
    );
}

export function ToggleGroup({ options, value, onChange }) {
    return (
        <div className="cs-toggle-group">
            {options.map((o) => (
                <button key={o.value} type="button"
                    className={`cs-toggle-btn${value === o.value ? " cs-toggle-btn--on" : ""}`}
                    onClick={() => onChange(o.value)}>
                    {o.dot && <span className={`cs-dot cs-dot--${o.value}`} />}
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function Checkbox({ label, hint, checked, onChange }) {
    return (
        <label className="cs-checkbox-row">
            <input type="checkbox" className="cs-checkbox" checked={checked} onChange={onChange} />
            <div>
                <span className="cs-checkbox-label">{label}</span>
                {hint && <span className="cs-hint">{hint}</span>}
            </div>
        </label>
    );
}

// ─── Sidebar shell ────────────────────────────────────────────────────────────
export function EditorSidebar({ title, steps, currentStep, onGoToStep, onCancel }) {
    return (
        <aside className="cs-sidebar">
            <div className="cs-sidebar__title">{title}</div>
            <nav className="cs-step-nav">
                {steps.map((step, idx) => {
                    const state = idx < currentStep ? "done" : idx === currentStep ? "active" : "upcoming";
                    return (
                        <button key={step.id}
                            className={`cs-step-nav__item cs-step-nav__item--${state}`}
                            onClick={() => onGoToStep(idx)}
                            disabled={idx > currentStep}>
                            <div className="cs-step-nav__marker">{state === "done" ? "✓" : idx + 1}</div>
                            <div className="cs-step-nav__text">
                                <div className="cs-step-nav__label">{step.label}</div>
                                <div className="cs-step-nav__desc">{step.desc}</div>
                            </div>
                        </button>
                    );
                })}
            </nav>
            <div className="cs-sidebar__footer">
                <button className="cs-cancel-btn" onClick={onCancel}>Cancel</button>
            </div>
        </aside>
    );
}

// ─── Step 1 — Details ─────────────────────────────────────────────────────────
export function StepDetails({ data, onChange, classes }) {
    return (
        <div className="cs-step-body">
            <div className="cs-step-heading">
                <h2>Scenario Details</h2>
                <p>Basic information and configuration for this scenario.</p>
            </div>
            <Field label="Title" required>
                <input className="cs-input" value={data.title} maxLength={255}
                    onChange={(e) => onChange("title", e.target.value)}
                    placeholder="e.g. Operation Midnight Breach" />
            </Field>
            <Field label="Description">
                <textarea className="cs-input cs-textarea" value={data.description} rows={4}
                    onChange={(e) => onChange("description", e.target.value)}
                    placeholder="Describe the scenario…" />
            </Field>
            <div className="cs-row-2col">
                <Field label="Difficulty" required>
                    <ToggleGroup
                        options={[
                            { value: "easy",   label: "Easy",   dot: true },
                            { value: "medium", label: "Medium", dot: true },
                            { value: "hard",   label: "Hard",   dot: true },
                        ]}
                        value={data.difficulty}
                        onChange={(v) => onChange("difficulty", v)}
                    />
                </Field>
                <Field label="Estimated Duration (minutes)">
                    <input className="cs-input" type="number" min={5} max={480}
                        value={data.estimated_time_minutes} placeholder="e.g. 90"
                        onChange={(e) => onChange("estimated_time_minutes", parseInt(e.target.value) || "")} />
                </Field>
            </div>
            <Field label="Assign to Classes" required
                hint="Select one or more classes. Students in selected classes will see this scenario once published.">
                <div className="cs-class-checkboxes">
                    {classes.length === 0 ? (
                        <div className="cs-empty-inline">No classes yet. Create a class first.</div>
                    ) : (
                        classes.map((c) => {
                            const selected = data.class_ids.includes(c.id);
                            return (
                                <label key={c.id} className={`cs-class-option${selected ? " cs-class-option--selected" : ""}`}>
                                    <input type="checkbox" className="cs-checkbox" checked={selected}
                                        onChange={() => {
                                            const next = selected
                                                ? data.class_ids.filter((id) => id !== c.id)
                                                : [...data.class_ids, c.id];
                                            onChange("class_ids", next);
                                        }} />
                                    <span className="cs-class-option__name">{c.name}</span>
                                    {c.student_count !== undefined && (
                                        <span className="cs-class-option__count">{c.student_count} students</span>
                                    )}
                                </label>
                            );
                        })
                    )}
                </div>
            </Field>
        </div>
    );
}

// ─── Step 2 — Scenario Builder ────────────────────────────────────────────────
export function StepScenario({ mode, phases, setPhases, scenarioLevel, setScenarioLevel }) {
    const isNarrative = mode === "narrative";

    const addPhase = () =>
        setPhases([...phases.map((p) => ({ ...p, expanded: false })), newPhase()]);
    const updatePhase = (idx, updated) =>
        setPhases(phases.map((p, i) => i === idx ? updated : p));
    const removePhase = (idx) =>
        setPhases(phases.filter((_, i) => i !== idx));
    const movePhase = (idx, dir) => {
        const next = [...phases];
        const swap = idx + dir;
        if (swap < 0 || swap >= next.length) return;
        [next[idx], next[swap]] = [next[swap], next[idx]];
        setPhases(next);
    };

    return (
        <div className="cs-step-body">
            <div className="cs-step-heading">
                <h2>Scenario Builder</h2>
                <p>{isNarrative
                    ? "Each phase holds evidence items with volatility and trigger rules, plus phase questions. Students extract evidence using scenario-time units."
                    : "Add phases to structure your scenario. Each phase holds its own injects, objectives, and questions."
                }</p>
            </div>
            {phases.length === 0 && (
                <div className="cs-empty-state">No phases yet — add phases to create a structured experience.</div>
            )}
            <div className="cs-phase-list">
                {phases.map((phase, idx) =>
                    isNarrative ? (
                        <NarrativePhaseCard
                            key={phase._id} phase={phase} index={idx} total={phases.length}
                            onUpdate={(updated) => updatePhase(idx, updated)}
                            onRemove={removePhase} onMove={movePhase}
                            allPhaseInjects={phases.flatMap((p) => p.injects)}
                        />
                    ) : (
                        <PhaseCard
                            key={phase._id} phase={phase} index={idx} total={phases.length}
                            onUpdate={(updated) => updatePhase(idx, updated)}
                            onRemove={removePhase} onMove={movePhase}
                        />
                    )
                )}
            </div>
            <button className="cs-add-phase-btn" onClick={addPhase}>+ Add Phase</button>
            {!isNarrative && (
                <ScenarioLevelSection data={scenarioLevel} onChange={setScenarioLevel} />
            )}
        </div>
    );
}

// ─── Step 3 — Review ──────────────────────────────────────────────────────────
export function StepReview({ mode, details, phases, scenarioLevel, classes, isEdit }) {
    const classNames = details.class_ids
        .map((id) => classes.find((c) => c.id === id)?.name).filter(Boolean);
    const diffColor  = { easy: "#52b788", medium: "#f4a261", hard: "#e63946" };
    const totalMins  = phases.reduce((s, p) => s + (p.duration_minutes || 0), 0);

    return (
        <div className="cs-step-body">
            <div className="cs-step-heading">
                <h2>{isEdit ? "Review & Save" : "Review & Create"}</h2>
                <p>{isEdit
                    ? "Saving will unpublish this scenario. Re-publish from the Scenarios page when ready."
                    : "The scenario will be saved as a draft. Publish it from the Scenarios page when ready."
                }</p>
            </div>
            <div className="cs-review-card">
                <div className="cs-review-card__title">Details</div>
                <div className="cs-review-row"><span>Title</span><span>{details.title || <em>—</em>}</span></div>
                <div className="cs-review-row"><span>Mode</span>
                    <span style={{ textTransform: "capitalize" }}>{mode?.replace("_", " ") || "—"}</span>
                </div>
                <div className="cs-review-row"><span>Difficulty</span>
                    <span style={{ color: diffColor[details.difficulty], fontWeight: 600 }}>{details.difficulty || "—"}</span>
                </div>
                <div className="cs-review-row"><span>Est. Time</span>
                    <span>{details.estimated_time_minutes ? `${details.estimated_time_minutes} min` : "—"}</span>
                </div>
                <div className="cs-review-row"><span>Classes</span>
                    <span>{classNames.length ? classNames.join(", ") : "—"}</span>
                </div>
            </div>
            <div className="cs-review-card">
                <div className="cs-review-card__title">Phases ({phases.length})</div>
                {phases.length === 0 ? (
                    <div className="cs-review-empty">Single continuous session — no phases.</div>
                ) : (
                    <>
                        {phases.map((p, i) => (
                            <div key={p._id} className="cs-review-phase">
                                <div className="cs-review-phase__head">
                                    <span className="cs-review-phase__num">Phase {i + 1}</span>
                                    <span className="cs-review-phase__name">{p.title || "Untitled"}</span>
                                    <span className="cs-chip">{p.duration_minutes}min lab</span>
                                    {mode === "narrative" && (
                                        <span className="cs-chip cs-chip--narrative">{p.time_budget ?? 30}u budget</span>
                                    )}
                                    {p.requires_completion && <span className="cs-chip cs-chip--gate">Gated</span>}
                                </div>
                                <div className="cs-review-phase__items">
                                    {p.injects.length > 0   && <span className="cs-review-tag">{p.injects.length} evidence item{p.injects.length !== 1 ? "s" : ""}</span>}
                                    {p.questions.length > 0 && <span className="cs-review-tag">{p.questions.length} question{p.questions.length !== 1 ? "s" : ""}</span>}
                                    {(p.injects.length + p.questions.length) === 0 && (
                                        <span className="cs-review-empty-inline">No items</span>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div className="cs-review-row cs-review-row--total">
                            <span>Total lab time</span><span>{totalMins} min</span>
                        </div>
                    </>
                )}
            </div>
            {mode === "open_ended" && (
                <div className="cs-review-card">
                    <div className="cs-review-card__title">Scenario-level</div>
                    <div className="cs-review-row"><span>Free-roaming injects</span><span>{scenarioLevel.injects.length}</span></div>
                    <div className="cs-review-row"><span>Scenario objectives</span><span>{scenarioLevel.objectives.length}</span></div>
                    <div className="cs-review-row"><span>End-of-scenario questions</span><span>{scenarioLevel.questions.length}</span></div>
                </div>
            )}
            <div className="cs-review-notice">
                {isEdit
                    ? <>This scenario will be <strong>unpublished</strong> after saving.</>
                    : <>This scenario will be saved as a <strong>draft</strong>.</>}
            </div>
        </div>
    );
}

// ─── Validation ───────────────────────────────────────────────────────────────
export function validate(stepId, { details, phases, mode }) {
    const errors = [];

    if (stepId === "details") {
        if (!details.title.trim())        errors.push("Title is required.");
        if (!details.difficulty)          errors.push("Difficulty is required.");
        if (details.class_ids.length < 1) errors.push("Assign this scenario to at least one class.");
    }

    if (stepId === "scenario") {
        phases.forEach((p, i) => {
            if (!p.title.trim())
                errors.push(`Phase ${i + 1}: title is required.`);
            if (!p.duration_minutes || p.duration_minutes < 1)
                errors.push(`Phase ${i + 1}: duration must be at least 1 minute.`);
            if (mode === "narrative" && (!p.time_budget || p.time_budget < 1))
                errors.push(`Phase ${i + 1}: scenario time budget must be at least 1 unit.`);

            p.injects.forEach((inj, j) => {
                const label = `Phase ${i + 1} › Evidence ${j + 1}`;

                if (!inj.title.trim())
                    errors.push(`${label}: title is required.`);
                if (inj.upload_status === "uploading")
                    errors.push(`${label}: primary file still uploading.`);
                if (inj.upload_status === "error")
                    errors.push(`${label}: primary file upload failed.`);

                if (mode === "narrative") {
                    // Volatility requires lifespan + low-quality file
                    if (inj.volatility !== "none" && !inj.lifespan_units)
                        errors.push(`${label}: lifespan (units) required when volatility is set.`);
                    if (inj.volatility !== "none" && inj.lifespan_units &&
                        inj.upload_status_low_quality === "idle")
                        errors.push(`${label}: low-quality file required when volatility is set.`);
                    if (inj.upload_status_low_quality === "uploading")
                        errors.push(`${label}: low-quality file still uploading.`);
                    if (inj.upload_status_low_quality === "error")
                        errors.push(`${label}: low-quality file upload failed.`);

                    // Trigger validation
                    if (inj.trigger_type === "time_elapsed" && !inj.trigger_threshold)
                        errors.push(`${label}: time threshold required for "time elapsed" trigger.`);
                    if (inj.trigger_type === "evidence_extracted" && !inj.trigger_ref_inject_id)
                        errors.push(`${label}: reference evidence item required for "evidence extracted" trigger.`);
                }
            });

            p.objectives?.forEach((obj, j) => {
                if (!obj.description.trim())
                    errors.push(`Phase ${i + 1} › Objective ${j + 1}: description is required.`);
            });
            p.questions.forEach((q, j) => {
                if (!q.question_text.trim())
                    errors.push(`Phase ${i + 1} › Question ${j + 1}: text is required.`);
            });
        });
    }

    return errors;
}

// ─── Payload builder ──────────────────────────────────────────────────────────
export function buildPayload({ details, phases, scenarioLevel, mode }) {
    const allInjects = [], allObjectives = [], allQuestions = [];

    phases.forEach((phase) => {
        phase.injects.forEach((inj) =>
            allInjects.push({ ...inj, _phaseId: phase._id, file_obj: null }));
        phase.objectives?.forEach((obj) =>
            allObjectives.push({ ...obj, _phaseId: phase._id }));
        phase.questions.forEach((q) =>
            allQuestions.push({ ...q, _phaseId: phase._id }));
    });

    if (mode === "open_ended") {
        scenarioLevel.injects.forEach((inj) =>
            allInjects.push({ ...inj, _phaseId: null, file_obj: null }));
        scenarioLevel.objectives.forEach((obj) =>
            allObjectives.push({ ...obj, _phaseId: null }));
        scenarioLevel.questions.forEach((q) =>
            allQuestions.push({ ...q, _phaseId: null }));
    }

    return {
        ...details, mode,
        phases:     phases.map((p, i) => ({ ...p, order_index: i })),
        injects:    allInjects,
        objectives: allObjectives,
        questions:  allQuestions,
        // No decisions key — removed from backend
    };
}

// ─── DB → form state mapper ───────────────────────────────────────────────────
export function mapApiResponseToState(data) {
    const { scenario, phases, injects, objectives = [], questions, triggers = [] } = data;

    // Build a trigger lookup by inject_id for O(1) access
    const triggerByInjectId = {};
    triggers.forEach((t) => { triggerByInjectId[t.inject_id] = t; });

    const mappedPhases = phases.map((p) => {
        const _id = uid();
        return {
            _id, _dbId: p.id,
            title: p.title,
            description: p.description || "",
            duration_minutes: p.duration_minutes,
            time_budget: p.time_budget ?? 30,
            requires_completion: p.requires_completion,
            expanded: false,
            injects: injects
                .filter((inj) => inj.phase_id === p.id)
                .map((inj) => {
                    const trigger = triggerByInjectId[inj.id] || {};
                    return {
                        _id: uid(),
                        title: inj.title,
                        description: inj.description || "",
                        // Primary file
                        file_name: inj.file_path ? inj.file_path.split("/").pop() : "",
                        file_type: inj.file_type || "", file_size: null,
                        file_path: inj.file_path || "", file_obj: null,
                        upload_status: inj.file_path ? "done" : "idle",
                        // Low-quality file
                        file_path_low_quality: inj.file_path_low_quality || "",
                        file_name_low_quality: inj.file_path_low_quality
                            ? inj.file_path_low_quality.split("/").pop() : "",
                        file_size_low_quality: null,
                        file_type_low_quality: "",
                        upload_status_low_quality: inj.file_path_low_quality ? "done" : "idle",
                        // Open-ended release fields
                        release_type: inj.release_type || "random_in_phase",
                        min_delay_minutes: inj.min_delay_minutes ?? 0,
                        max_delay_minutes: inj.max_delay_minutes ?? 10,
                        guaranteed_release_minutes: inj.guaranteed_release_minutes ?? "",
                        notify_student: inj.notify_student !== false,
                        // Narrative volatility
                        lifespan_units: inj.lifespan_units || "",
                        volatility: inj.volatility || "none",
                        // Narrative acquisition costs
                        extraction_cost_full: inj.extraction_cost_full ?? 5,
                        extraction_cost_live: inj.extraction_cost_live ?? 2,
                        // Trigger
                        trigger_type: trigger.trigger_type || "always",
                        trigger_threshold: trigger.threshold_value ?? "",
                        trigger_ref_inject_id: trigger.ref_inject_id || "",
                    };
                }),
            objectives: [],
            questions: questions
                .filter((q) => q.phase_id === p.id)
                .map((q) => ({
                    _id: uid(),
                    question_text: q.question_text,
                    question_type: q.question_type,
                    blocks_progression: q.blocks_progression,
                    max_score: q.max_score ?? 10,
                })),
        };
    });

    // Scenario-level items (open-ended only)
    const scenarioLevel = {
        injects: injects.filter((inj) => inj.phase_id === null).map((inj) => ({
            _id: uid(), title: inj.title, description: inj.description || "",
            file_name: inj.file_path ? inj.file_path.split("/").pop() : "",
            file_type: inj.file_type || "", file_size: null,
            file_path: inj.file_path || "", file_obj: null,
            upload_status: inj.file_path ? "done" : "idle",
            file_path_low_quality: inj.file_path_low_quality || "",
            file_name_low_quality: inj.file_path_low_quality
                ? inj.file_path_low_quality.split("/").pop() : "",
            file_size_low_quality: null, file_type_low_quality: "",
            upload_status_low_quality: inj.file_path_low_quality ? "done" : "idle",
            release_type: inj.release_type || "random_in_phase",
            min_delay_minutes: inj.min_delay_minutes ?? 0,
            max_delay_minutes: inj.max_delay_minutes ?? 10,
            guaranteed_release_minutes: inj.guaranteed_release_minutes ?? "",
            notify_student: inj.notify_student !== false,
            lifespan_units: inj.lifespan_units || "",
            volatility: inj.volatility || "none",
            extraction_cost_full: inj.extraction_cost_full ?? 5,
            extraction_cost_live: inj.extraction_cost_live ?? 2,
            trigger_type: "always",
            trigger_threshold: "",
            trigger_ref_inject_id: "",
        })),
        objectives: objectives.map((obj) => ({
            _id: uid(), description: obj.description, objective_type: obj.objective_type,
            max_score: obj.max_score ?? 10, correct_answer: obj.correct_answer || "",
            max_attempts: obj.max_attempts || "",
        })),
        questions: questions.filter((q) => q.phase_id === null).map((q) => ({
            _id: uid(), question_text: q.question_text, question_type: q.question_type,
            blocks_progression: q.blocks_progression, max_score: q.max_score ?? 10,
        })),
    };

    return {
        details: {
            title: scenario.title,
            description: scenario.description || "",
            difficulty: scenario.difficulty,
            estimated_time_minutes: scenario.estimated_time_minutes || "",
            class_ids: [],
        },
        phases: mappedPhases,
        scenarioLevel,
        mode: scenario.mode || "open_ended",
    };
}

// ─── Step definitions ─────────────────────────────────────────────────────────
export const STEPS = [
    { id: "details",  label: "Details",       desc: "Name, class, difficulty" },
    { id: "scenario", label: "Scenario",       desc: "Phases, evidence, questions" },
    { id: "review",   label: "Review & Save",  desc: "Confirm and save" },
];