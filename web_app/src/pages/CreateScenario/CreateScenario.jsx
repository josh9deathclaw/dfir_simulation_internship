import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { getToken } from "../../utils/auth";
import FileUploadZone from "../../components/CreateScenario/FileUploadZone";
import InjectRow from "../../components/CreateScenario/InjectRow";
import ObjectiveRow from "../../components/CreateScenario/ObjectiveRow";
import QuestionRow from "../../components/CreateScenario/QuestionRow";
import PhaseCard from "../../components/CreateScenario/PhaseCard";
import ScenarioLevelSection from "../../components/CreateScenario/ScenarioLevelSection";
import "./CreateScenario.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const STEPS = [
    { id: "details",  label: "Details",        desc: "Name, class, difficulty" },
    { id: "scenario", label: "Scenario",        desc: "Phases, injects, objectives" },
    { id: "review",   label: "Review & Create", desc: "Confirm and save" },
];

function uid() {
    return Math.random().toString(36).slice(2, 10);
}

function newPhase() {
    return {
        _id: uid(),
        title: "", description: "",
        duration_minutes: 30,
        requires_completion: false,
        expanded: true,
        injects: [], objectives: [], questions: [],
    };
}

function newInject(releaseType = "random_in_phase") {
    return {
        _id: uid(),
        title: "",
        description: "",
        // File fields — populated automatically when teacher uploads a file
        file_name: "",        // original filename
        file_type: "",        // auto-detected human label
        file_size: null,      // bytes
        file_path: "",        // set after upload to /api/uploads
        file_obj: null,       // the raw File object (not sent to DB)
        upload_status: "idle",// idle | uploading | done | error
        // Release
        release_type: releaseType,
        min_delay_minutes: 0,
        max_delay_minutes: 10,
        guaranteed_release_minutes: "",
        notify_student: true,
    };
}

function newObjective() {
    return { _id: uid(), description: "", objective_type: "main", blocks_progression: false };
}

function newQuestion(type = "phase_question") {
    return { _id: uid(), question_text: "", blocks_progression: false, question_type: type };
}

// ─── Shared Primitives ────────────────────────────────────────────────────────
function Field({ label, required, hint, children }) {
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

function ToggleGroup({ options, value, onChange }) {
    return (
        <div className="cs-toggle-group">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    className={`cs-toggle-btn${value === o.value ? " cs-toggle-btn--on" : ""}`}
                    onClick={() => onChange(o.value)}
                >
                    {o.dot && <span className={`cs-dot cs-dot--${o.value}`} />}
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function Checkbox({ label, hint, checked, onChange }) {
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








// ─── Scenario-level pinned section ────────────────────────────────────────────
// ─── Step 1 — Details ─────────────────────────────────────────────────────────
function StepDetails({ data, onChange, classes }) {
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
                    placeholder="Describe the scenario, its context, and what students will investigate…" />
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
                        <div className="cs-empty-inline">No classes yet. Create a class first from the Classes page.</div>
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
function StepScenario({ phases, setPhases, scenarioLevel, setScenarioLevel }) {
    const addPhase = () => {
        setPhases([...phases.map((p) => ({ ...p, expanded: false })), newPhase()]);
    };

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
                <p>Add phases to structure your scenario. Each phase holds its own injects, objectives, and questions. The pinned section at the bottom is for anything not tied to a specific phase.</p>
            </div>

            {phases.length === 0 && (
                <div className="cs-empty-state">
                    No phases yet — the scenario will run as a single continuous session.
                    Add phases to create a structured, time-gated experience.
                </div>
            )}

            <div className="cs-phase-list">
                {phases.map((phase, idx) => (
                    <PhaseCard key={phase._id} phase={phase} index={idx} total={phases.length}
                        onUpdate={(updated) => updatePhase(idx, updated)}
                        onRemove={removePhase}
                        onMove={movePhase} />
                ))}
            </div>

            <button className="cs-add-phase-btn" onClick={addPhase}>+ Add Phase</button>

            <ScenarioLevelSection data={scenarioLevel} onChange={setScenarioLevel} />
        </div>
    );
}

// ─── Step 3 — Review ──────────────────────────────────────────────────────────
function StepReview({ details, phases, scenarioLevel, classes }) {
    const classNames = details.class_ids
        .map((id) => classes.find((c) => c.id === id)?.name)
        .filter(Boolean);

    const diffColor = { easy: "#52b788", medium: "#f4a261", hard: "#e63946" };
    const totalMins = phases.reduce((s, p) => s + (p.duration_minutes || 0), 0);

    return (
        <div className="cs-step-body">
            <div className="cs-step-heading">
                <h2>Review & Create</h2>
                <p>The scenario will be saved as a draft. Publish it from the Scenarios page when ready.</p>
            </div>

            <div className="cs-review-card">
                <div className="cs-review-card__title">Details</div>
                <div className="cs-review-row"><span>Title</span><span>{details.title || <em>—</em>}</span></div>
                <div className="cs-review-row">
                    <span>Difficulty</span>
                    <span style={{ color: diffColor[details.difficulty], fontWeight: 600 }}>
                        {details.difficulty || "—"}
                    </span>
                </div>
                <div className="cs-review-row">
                    <span>Est. Time</span>
                    <span>{details.estimated_time_minutes ? `${details.estimated_time_minutes} min` : "—"}</span>
                </div>
                <div className="cs-review-row">
                    <span>Classes</span>
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
                                    <span className="cs-chip">{p.duration_minutes}min</span>
                                    {p.requires_completion && <span className="cs-chip cs-chip--gate">Gated</span>}
                                </div>
                                <div className="cs-review-phase__items">
                                    {p.injects.length > 0    && <span className="cs-review-tag">{p.injects.length} inject{p.injects.length !== 1 ? "s" : ""}</span>}
                                    {p.objectives.length > 0 && <span className="cs-review-tag">{p.objectives.length} objective{p.objectives.length !== 1 ? "s" : ""}</span>}
                                    {p.questions.length > 0  && <span className="cs-review-tag">{p.questions.length} question{p.questions.length !== 1 ? "s" : ""}</span>}
                                    {(p.injects.length + p.objectives.length + p.questions.length) === 0 && (
                                        <span className="cs-review-empty-inline">No items</span>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div className="cs-review-row cs-review-row--total">
                            <span>Total phase time</span><span>{totalMins} min</span>
                        </div>
                    </>
                )}
            </div>

            <div className="cs-review-card">
                <div className="cs-review-card__title">Scenario-level</div>
                <div className="cs-review-row"><span>Free-roaming injects</span><span>{scenarioLevel.injects.length}</span></div>
                <div className="cs-review-row"><span>Scenario objectives</span><span>{scenarioLevel.objectives.length}</span></div>
                <div className="cs-review-row"><span>End-of-scenario questions</span><span>{scenarioLevel.questions.length}</span></div>
            </div>

            <div className="cs-review-notice">
                This scenario will be saved as a <strong>draft</strong> and won't be visible to students until you publish it.
            </div>
        </div>
    );
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validate(stepId, { details, phases }) {
    const errors = [];
    if (stepId === "details") {
        if (!details.title.trim())        errors.push("Title is required.");
        if (!details.difficulty)          errors.push("Difficulty is required.");
        if (details.class_ids.length < 1) errors.push("Assign this scenario to at least one class.");
    }
    if (stepId === "scenario") {
        phases.forEach((p, i) => {
            if (!p.title.trim()) errors.push(`Phase ${i + 1}: title is required.`);
            if (!p.duration_minutes || p.duration_minutes < 1) errors.push(`Phase ${i + 1}: duration must be at least 1 minute.`);
            p.injects.forEach((inj, j) => {
                if (!inj.title.trim()) errors.push(`Phase ${i + 1} › Inject ${j + 1}: title is required.`);
                if (inj.upload_status === "uploading") errors.push(`Phase ${i + 1} › Inject ${j + 1}: file still uploading, please wait.`);
                if (inj.upload_status === "error") errors.push(`Phase ${i + 1} › Inject ${j + 1}: file upload failed. Please re-upload.`);
            });
            p.objectives.forEach((obj, j) => {
                if (!obj.description.trim()) errors.push(`Phase ${i + 1} › Objective ${j + 1}: description is required.`);
            });
            p.questions.forEach((q, j) => {
                if (!q.question_text.trim()) errors.push(`Phase ${i + 1} › Question ${j + 1}: question text is required.`);
            });
        });
    }
    return errors;
}

// ─── Payload builder ──────────────────────────────────────────────────────────
function buildPayload({ details, phases, scenarioLevel }) {
    const allInjects    = [];
    const allObjectives = [];
    const allQuestions  = [];

    phases.forEach((phase) => {
        phase.injects.forEach((inj) => allInjects.push({
            ...inj,
            _phaseId: phase._id,
            file_obj: undefined, // never send File objects to the server
        }));
        phase.objectives.forEach((obj) => allObjectives.push({ ...obj, _phaseId: phase._id }));
        phase.questions.forEach((q)   => allQuestions.push({ ...q, _phaseId: phase._id }));
    });

    scenarioLevel.injects.forEach((inj) => allInjects.push({
        ...inj, _phaseId: null, file_obj: undefined,
    }));
    scenarioLevel.objectives.forEach((obj) => allObjectives.push({ ...obj, _phaseId: null }));
    scenarioLevel.questions.forEach((q)   => allQuestions.push({ ...q, _phaseId: null }));

    return {
        ...details,
        phases:     phases.map((p, i) => ({ ...p, order_index: i })),
        injects:    allInjects,
        objectives: allObjectives,
        questions:  allQuestions,
    };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CreateScenario() {
    const navigate = useNavigate();
    const token    = getToken();

    const [currentStep, setCurrentStep] = useState(0);
    const [errors,      setErrors]      = useState([]);
    const [saving,      setSaving]      = useState(false);
    const [classes,     setClasses]     = useState([]);

    const [details, setDetails] = useState({
        title: "", description: "", difficulty: "",
        class_ids: [], estimated_time_minutes: "",
    });
    const [phases,        setPhases]        = useState([]);
    const [scenarioLevel, setScenarioLevel] = useState({ injects: [], objectives: [], questions: [] });

    useEffect(() => {
        fetch(`${process.env.REACT_APP_API_URL}/api/classes`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((data) => setClasses(Array.isArray(data) ? data : []))
            .catch(() => {});
    }, [token]);

    const stepIds = STEPS.map((s) => s.id);

    const goNext = () => {
        const errs = validate(stepIds[currentStep], { details, phases });
        if (errs.length) { setErrors(errs); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
        setErrors([]);
        setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const goBack = () => {
        setErrors([]);
        setCurrentStep((s) => Math.max(s - 1, 0));
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const goToStep = (idx) => {
        if (idx < currentStep) { setErrors([]); setCurrentStep(idx); }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${process.env.REACT_APP_API_URL}/api/scenarios`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(buildPayload({ details, phases, scenarioLevel })),
            });
            if (!res.ok) throw new Error();
            navigate("/scenarios");
        } catch {
            setErrors(["Failed to save. Please try again."]);
        } finally {
            setSaving(false);
        }
    };

    const isLastStep = currentStep === STEPS.length - 1;

    return (
        <>
            <Navbar />
            <div className="cs-page">
                <aside className="cs-sidebar">
                    <div className="cs-sidebar__title">Create Scenario</div>
                    <nav className="cs-step-nav">
                        {STEPS.map((step, idx) => {
                            const state = idx < currentStep ? "done" : idx === currentStep ? "active" : "upcoming";
                            return (
                                <button key={step.id}
                                    className={`cs-step-nav__item cs-step-nav__item--${state}`}
                                    onClick={() => goToStep(idx)}
                                    disabled={idx > currentStep}
                                >
                                    <div className="cs-step-nav__marker">
                                        {state === "done" ? "✓" : idx + 1}
                                    </div>
                                    <div className="cs-step-nav__text">
                                        <div className="cs-step-nav__label">{step.label}</div>
                                        <div className="cs-step-nav__desc">{step.desc}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </nav>
                    <div className="cs-sidebar__footer">
                        <button className="cs-cancel-btn" onClick={() => navigate("/scenarios")}>Cancel</button>
                    </div>
                </aside>

                <main className="cs-main">
                    <div className="cs-main__inner">
                        {errors.length > 0 && (
                            <div className="cs-error-box">
                                {errors.map((e, i) => <div key={i}>· {e}</div>)}
                            </div>
                        )}

                        {currentStep === 0 && (
                            <StepDetails
                                data={details}
                                onChange={(field, val) => setDetails((d) => ({ ...d, [field]: val }))}
                                classes={classes}
                            />
                        )}
                        {currentStep === 1 && (
                            <StepScenario
                                phases={phases} setPhases={setPhases}
                                scenarioLevel={scenarioLevel} setScenarioLevel={setScenarioLevel}
                            />
                        )}
                        {currentStep === 2 && (
                            <StepReview
                                details={details} phases={phases}
                                scenarioLevel={scenarioLevel} classes={classes}
                            />
                        )}

                        <div className="cs-footer-nav">
                            <button className="cs-btn cs-btn--ghost" onClick={goBack} disabled={currentStep === 0}>
                                ← Back
                            </button>
                            {isLastStep ? (
                                <button className="cs-btn cs-btn--primary" onClick={handleSave} disabled={saving}>
                                    {saving ? "Saving…" : "Create Scenario"}
                                </button>
                            ) : (
                                <button className="cs-btn cs-btn--primary" onClick={goNext}>
                                    Next →
                                </button>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </>
    );
}