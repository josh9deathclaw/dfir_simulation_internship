// src/components/ScenarioEditor/NarrativePhaseCard.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Phase card for narrative mode.
// Tabs: Evidence | Questions  (Decisions tab removed — decisions infrastructure dropped)
//
// Evidence tab per inject:
//   • Title, description (via InjectRow — open-ended fields hidden via CSS or skipped)
//   • Primary file upload (via FileUploadZone)
//   • Volatility toggle + lifespan_units
//   • Low-quality file upload (conditional on volatility !== 'none')
//   • extraction_cost_full / extraction_cost_live number inputs
//   • Trigger section: type dropdown + conditional threshold/ref fields
//   • Auto-computed threshold preview line
//
// Phase header gains time_budget input.
// Right panel renders <NarrativePreview> with the phase's inject data.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import FileUploadZone from "../CreateScenario/FileUploadZone";
import QuestionRow from "../CreateScenario/QuestionRow";
import {
    Field, uid,
    newInject, newQuestion,
    computeThresholds,
} from "./CreateEditScenarioLogic";

// ─── Constants ────────────────────────────────────────────────────────────────
const VOLATILITY_OPTIONS = [
    { value: "none",    label: "Stable",  hint: "Never degrades" },
    { value: "average", label: "Average", hint: "Degrades at 50% of lifespan" },
    { value: "high",    label: "High",    hint: "Degrades at 25% of lifespan" },
];
const VOLATILITY_COLORS = { none: "#52b788", average: "#f4a261", high: "#e63946" };

const TRIGGER_OPTIONS = [
    { value: "always",             label: "Always (available at start)" },
    { value: "time_elapsed",       label: "Time elapsed" },
    { value: "evidence_extracted", label: "After evidence extracted" },
];

// ─── Low-quality upload zone ──────────────────────────────────────────────────
// Wraps FileUploadZone mapping low-quality fields to/from the proxy shape it expects.
function LowQualityUploadZone({ inject, onUpdate }) {
    const proxy = {
        ...inject,
        file_name:     inject.file_name_low_quality || "",
        file_type:     inject.file_type_low_quality || "",
        file_size:     inject.file_size_low_quality || null,
        file_path:     inject.file_path_low_quality || "",
        upload_status: inject.upload_status_low_quality || "idle",
        title:         inject.title || " ", // suppress auto-fill
    };

    const handleUpdate = (updated) => {
        onUpdate({
            ...inject,
            file_name_low_quality:     updated.file_name,
            file_type_low_quality:     updated.file_type,
            file_size_low_quality:     updated.file_size,
            file_path_low_quality:     updated.file_path,
            upload_status_low_quality: updated.upload_status,
        });
    };

    return (
        <div className="cs-low-quality-upload">
            <div className="cs-low-quality-upload__label">
                Low-quality version
                <span className="cs-hint"> — delivered when evidence has degraded</span>
            </div>
            <FileUploadZone inject={proxy} onUpdate={handleUpdate} />
        </div>
    );
}

// ─── Trigger section ──────────────────────────────────────────────────────────
function TriggerSection({ inject, onUpdate, allPhaseInjects }) {
    const otherInjects = allPhaseInjects.filter((i) => i._id !== inject._id);

    return (
        <div className="cs-trigger-section">
            <Field label="Discovery trigger">
                <select className="cs-input"
                    value={inject.trigger_type}
                    onChange={(e) => onUpdate({
                        ...inject,
                        trigger_type: e.target.value,
                        trigger_threshold: "",
                        trigger_ref_inject_id: "",
                    })}>
                    {TRIGGER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </Field>

            {inject.trigger_type === "time_elapsed" && (
                <Field label="Discover at (scenario time units)" required
                    hint="Evidence becomes discoverable when scenario time reaches this value.">
                    <input className="cs-input" type="number" min={0}
                        value={inject.trigger_threshold}
                        onChange={(e) => onUpdate({
                            ...inject,
                            trigger_threshold: parseInt(e.target.value) || "",
                        })} />
                </Field>
            )}

            {inject.trigger_type === "evidence_extracted" && (
                <Field label="Discover after extracting" required
                    hint="Evidence becomes discoverable once the selected item has been extracted.">
                    <select className="cs-input"
                        value={inject.trigger_ref_inject_id}
                        onChange={(e) => onUpdate({ ...inject, trigger_ref_inject_id: e.target.value })}>
                        <option value="">Select evidence item…</option>
                        {otherInjects.map((inj) => (
                            <option key={inj._id} value={inj._id}>
                                {inj.title || "(untitled)"}
                            </option>
                        ))}
                    </select>
                </Field>
            )}
        </div>
    );
}

// ─── Narrative inject row ─────────────────────────────────────────────────────
function NarrativeEvidenceRow({ inject, index, onUpdate, onRemove, allPhaseInjects }) {
    const [expanded, setExpanded] = useState(true);

    const { degradeAt, destroyAt } = computeThresholds(
        inject.lifespan_units ? parseInt(inject.lifespan_units) : 0,
        inject.volatility
    );
    const showLowQuality    = inject.volatility !== "none";
    const thresholdPreview  = degradeAt != null
        ? `Degrades to low at ${degradeAt}u · Destroyed at ${destroyAt}u`
        : null;

    // Trigger label for collapsed header
    const triggerLabel = {
        always:             "Always visible",
        time_elapsed:       inject.trigger_threshold ? `Appears at ${inject.trigger_threshold}u` : "Time elapsed",
        evidence_extracted: inject.trigger_ref_inject_id
            ? `After: ${allPhaseInjects.find((i) => i._id === inject.trigger_ref_inject_id)?.title || "…"}`
            : "After extraction",
    }[inject.trigger_type] || "Always visible";

    return (
        <div className="cs-narrative-inject">
            {/* Row header */}
            <div className="cs-item-row__header" onClick={() => setExpanded((e) => !e)}
                style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="cs-item-row__number">Evidence {index + 1}</span>
                    {inject.title && (
                        <span className="cs-item-row__name">{inject.title}</span>
                    )}
                    <span className="cs-chip">{triggerLabel}</span>
                    {inject.volatility !== "none" && (
                        <span className="cs-chip"
                            style={{ borderColor: VOLATILITY_COLORS[inject.volatility],
                                     color: VOLATILITY_COLORS[inject.volatility] }}>
                            {inject.volatility}
                        </span>
                    )}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" className="cs-icon-btn cs-icon-btn--danger"
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
                    <span className="cs-expand-icon">{expanded ? "▲" : "▼"}</span>
                </div>
            </div>

            {expanded && (
                <div className="cs-narrative-inject__body">
                    {/* Title + description */}
                    <div className="cs-row-2col">
                        <Field label="Title" required>
                            <input className="cs-input" type="text" value={inject.title}
                                onChange={(e) => onUpdate({ ...inject, title: e.target.value })}
                                placeholder="e.g. Suspect Laptop Image" />
                        </Field>
                        <Field label="Description">
                            <textarea className="cs-input cs-textarea" value={inject.description}
                                rows={2}
                                onChange={(e) => onUpdate({ ...inject, description: e.target.value })}
                                placeholder="What does the student receive?" />
                        </Field>
                    </div>

                    {/* Primary file */}
                    <Field label="Primary evidence file"
                        hint="Delivered at high quality (or as the only version if non-volatile).">
                        <FileUploadZone inject={inject} onUpdate={onUpdate} />
                    </Field>

                    {/* Volatility + lifespan */}
                    <div className="cs-volatility-row">
                        <div className="cs-row-2col">
                            <Field label="Lifespan (scenario time units)"
                                hint="Scenario time since discovery at which evidence is destroyed.">
                                <input className="cs-input" type="number" min={1}
                                    value={inject.lifespan_units}
                                    placeholder="e.g. 20"
                                    onChange={(e) => onUpdate({
                                        ...inject,
                                        lifespan_units: parseInt(e.target.value) || "",
                                    })} />
                            </Field>
                            <Field label="Volatility">
                                <div className="cs-toggle-group">
                                    {VOLATILITY_OPTIONS.map((v) => (
                                        <button key={v.value} type="button"
                                            className={`cs-toggle-btn${inject.volatility === v.value ? " cs-toggle-btn--on" : ""}`}
                                            style={inject.volatility === v.value
                                                ? { borderColor: VOLATILITY_COLORS[v.value], color: VOLATILITY_COLORS[v.value] }
                                                : {}}
                                            title={v.hint}
                                            onClick={() => onUpdate({ ...inject, volatility: v.value })}>
                                            {v.label}
                                        </button>
                                    ))}
                                </div>
                            </Field>
                        </div>
                        {thresholdPreview && (
                            <span className="cs-volatility-preview">{thresholdPreview}</span>
                        )}
                    </div>

                    {/* Low-quality file — only when volatile */}
                    {showLowQuality && (
                        <LowQualityUploadZone inject={inject} onUpdate={onUpdate} />
                    )}

                    {/* Acquisition costs */}
                    <div className="cs-row-2col">
                        <Field label="Proper acquisition cost (units)"
                            hint="Scenario time spent for a full-quality extraction.">
                            <input className="cs-input" type="number" min={0}
                                value={inject.extraction_cost_full}
                                onChange={(e) => onUpdate({
                                    ...inject,
                                    extraction_cost_full: parseInt(e.target.value) || 0,
                                })} />
                        </Field>
                        <Field label="Live acquisition cost (units)"
                            hint="Scenario time spent for a quick low-quality extraction.">
                            <input className="cs-input" type="number" min={0}
                                value={inject.extraction_cost_live}
                                onChange={(e) => onUpdate({
                                    ...inject,
                                    extraction_cost_live: parseInt(e.target.value) || 0,
                                })} />
                        </Field>
                    </div>

                    {/* Trigger */}
                    <TriggerSection
                        inject={inject}
                        onUpdate={onUpdate}
                        allPhaseInjects={allPhaseInjects}
                    />
                </div>
            )}
        </div>
    );
}

// ─── Main NarrativePhaseCard ──────────────────────────────────────────────────
export default function NarrativePhaseCard({
    phase, index, total, onUpdate, onRemove, onMove, allPhaseInjects,
}) {
    const [expanded,  setExpanded]  = useState(phase.expanded ?? true);
    const [activeTab, setActiveTab] = useState("evidence");

    const update = (field, value) => onUpdate({ ...phase, [field]: value });

    const addEvidence    = () => update("injects",   [...phase.injects, newInject()]);
    const updateEvidence = (i, upd) => update("injects",   phase.injects.map((x, j) => j === i ? upd : x));
    const removeEvidence = (i) => update("injects",   phase.injects.filter((_, j) => j !== i));

    const addQuestion    = () => update("questions", [...phase.questions, newQuestion()]);
    const updateQuestion = (i, upd) => update("questions", phase.questions.map((x, j) => j === i ? upd : x));
    const removeQuestion = (i) => update("questions", phase.questions.filter((_, j) => j !== i));

    const tabs = [
        { id: "evidence",  label: `Evidence (${phase.injects.length})` },
        { id: "questions", label: `Questions (${phase.questions.length})` },
    ];

    return (
        <div className="cs-phase-card">
            {/* ── Header ────────────────────────────────────────────────────── */}
            <div className="cs-phase-card__header" onClick={() => setExpanded((e) => !e)}>
                <div className="cs-phase-card__header-left">
                    <span className="cs-phase-num">Phase {index + 1}</span>
                    <span className="cs-phase-title">{phase.title || "Untitled Phase"}</span>
                    <span className="cs-chip">{phase.duration_minutes}min lab</span>
                    <span className="cs-chip cs-chip--narrative">
                        {phase.time_budget ?? 30}u budget
                    </span>
                    <span className="cs-chip cs-chip--narrative">Narrative</span>
                </div>
                <div className="cs-phase-card__header-right">
                    <button type="button" className="cs-icon-btn" disabled={index === 0}
                        onClick={(e) => { e.stopPropagation(); onMove(index, -1); }}>↑</button>
                    <button type="button" className="cs-icon-btn" disabled={index === total - 1}
                        onClick={(e) => { e.stopPropagation(); onMove(index, 1); }}>↓</button>
                    <button type="button" className="cs-icon-btn cs-icon-btn--danger"
                        onClick={(e) => { e.stopPropagation(); onRemove(index); }}>×</button>
                    <span className="cs-expand-icon">{expanded ? "▲" : "▼"}</span>
                </div>
            </div>

            {expanded && (
                <div className="cs-phase-card__body cs-phase-card__body--narrative">
                    {/* ── Phase meta ────────────────────────────────────────── */}
                    <div className="cs-row-3col">
                        <Field label="Phase title" required>
                            <input className="cs-input" value={phase.title}
                                onChange={(e) => update("title", e.target.value)}
                                placeholder="e.g. On-Site Device Triage" />
                        </Field>
                        <Field label="Lab duration (minutes)" required
                            hint="Real wall-clock time. Phase ends when this hits zero.">
                            <input className="cs-input" type="number" min={1}
                                value={phase.duration_minutes}
                                onChange={(e) => update("duration_minutes", parseInt(e.target.value) || 0)} />
                        </Field>
                        <Field label="Scenario time budget (units)" required
                            hint="Max scenario-time units students can spend. Actions are rejected once exhausted.">
                            <input className="cs-input" type="number" min={1}
                                value={phase.time_budget ?? 30}
                                onChange={(e) => update("time_budget", parseInt(e.target.value) || 30)} />
                        </Field>
                    </div>
                    <Field label="Briefing">
                        <textarea className="cs-input cs-textarea" rows={2}
                            value={phase.description}
                            onChange={(e) => update("description", e.target.value)}
                            placeholder="Briefing shown to the student at the start of this phase…" />
                    </Field>

                    {/* ── Two-column layout: editor left, preview right ─────── */}
                    <div className="cs-narrative-phase-layout">
                        {/* Left: tabs + content */}
                        <div className="cs-narrative-phase-layout__editor">
                            <div className="cs-phase-tabs">
                                {tabs.map((t) => (
                                    <button key={t.id} type="button"
                                        className={`cs-phase-tab${activeTab === t.id ? " cs-phase-tab--active" : ""}`}
                                        onClick={() => setActiveTab(t.id)}>
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            {activeTab === "evidence" && (
                                <div className="cs-tab-body">
                                    {phase.injects.length === 0 && (
                                        <div className="cs-empty-inline">
                                            No evidence items yet. Add evidence for students to discover and extract.
                                        </div>
                                    )}
                                    {phase.injects.map((inj, i) => (
                                        <NarrativeEvidenceRow
                                            key={inj._id}
                                            inject={inj} index={i}
                                            allPhaseInjects={allPhaseInjects}
                                            onUpdate={(upd) => updateEvidence(i, upd)}
                                            onRemove={() => removeEvidence(i)}
                                        />
                                    ))}
                                    <button type="button" className="cs-add-sub-btn"
                                        onClick={addEvidence}>
                                        + Add Evidence
                                    </button>
                                </div>
                            )}

                            {activeTab === "questions" && (
                                <div className="cs-tab-body">
                                    {phase.questions.length === 0 && (
                                        <div className="cs-empty-inline">No questions yet.</div>
                                    )}
                                    {phase.questions.map((q, i) => (
                                        <QuestionRow key={q._id} question={q} index={i}
                                            onUpdate={(upd) => updateQuestion(i, upd)}
                                            onRemove={() => removeQuestion(i)} />
                                    ))}
                                    <button type="button" className="cs-add-sub-btn"
                                        onClick={addQuestion}>
                                        + Add Question
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}