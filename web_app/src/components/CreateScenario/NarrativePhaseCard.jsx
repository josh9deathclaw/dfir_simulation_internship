// src/components/ScenarioEditor/NarrativePhaseCard.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Phase card for narrative mode. Extends the open-ended phase with:
//   - Volatility + lifetime selector per inject
//   - Low-quality file upload per volatile inject
//   - Decision points (ordered list within the phase)
//   - Each decision has N options with time cost, outcome text,
//     and a state_effect builder (set variable / unlock inject / lock inject)
//   - Each decision has a conditions builder (key-value pairs that must
//     match attempt_state for the decision to be shown)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import InjectRow from "../CreateScenario/InjectRow";
import QuestionRow from "../CreateScenario/QuestionRow";
import FileUploadZone from "../CreateScenario/FileUploadZone";
import {
    Field, uid,
    newInject, newQuestion, newDecision, newDecisionOption,
    emptyStateEffect,
} from "./CreateEditScenarioLogic";

const VOLATILITY_OPTIONS = [
    { value: "none",    label: "Stable",  hint: "Never degrades" },
    { value: "average", label: "Average", hint: "Degrades at 50% of lifetime" },
    { value: "high",    label: "High",    hint: "Degrades at 25% of lifetime" },
];
const VOLATILITY_COLORS = { none: "#52b788", average: "#f4a261", high: "#e63946" };

// ─── Key-value pair list editor ───────────────────────────────────────────────
// Used for both decision conditions and state_effect "set" variables.
// pairs: [{ key: string, value: string, _id: string }]
// onChange(pairs)
function KVPairList({ pairs, onChange, keyPlaceholder = "variable name", valuePlaceholder = "value" }) {
    const addPair = () =>
        onChange([...pairs, { _id: uid(), key: "", value: "" }]);
    const updatePair = (i, field, val) =>
        onChange(pairs.map((p, j) => j === i ? { ...p, [field]: val } : p));
    const removePair = (i) =>
        onChange(pairs.filter((_, j) => j !== i));

    return (
        <div className="cs-kv-list">
            {pairs.map((pair, i) => (
                <div key={pair._id} className="cs-kv-row">
                    <input
                        className="cs-input cs-kv-input"
                        value={pair.key}
                        placeholder={keyPlaceholder}
                        onChange={(e) => updatePair(i, "key", e.target.value)}
                    />
                    <span className="cs-kv-eq">=</span>
                    <input
                        className="cs-input cs-kv-input"
                        value={pair.value}
                        placeholder={valuePlaceholder}
                        onChange={(e) => updatePair(i, "value", e.target.value)}
                    />
                    <button type="button" className="cs-icon-btn cs-icon-btn--danger"
                        onClick={() => removePair(i)}>×</button>
                </div>
            ))}
            <button type="button" className="cs-add-kv-btn" onClick={addPair}>
                + Add variable
            </button>
        </div>
    );
}

// Convert the state_effect.set object to/from the pair-list format used by KVPairList
function setObjToPairs(setObj) {
    return Object.entries(setObj || {}).map(([key, value]) => ({ _id: uid(), key, value }));
}
function pairsToSetObj(pairs) {
    const out = {};
    pairs.forEach(({ key, value }) => { if (key.trim()) out[key.trim()] = value; });
    return out;
}

// Convert the conditions object to/from the pair-list format
function conditionsObjToPairs(obj) {
    return Object.entries(obj || {}).map(([key, value]) => ({ _id: uid(), key, value }));
}
function pairsToConditionsObj(pairs) {
    const out = {};
    pairs.forEach(({ key, value }) => { if (key.trim()) out[key.trim()] = value; });
    return out;
}

// ─── State effect builder ─────────────────────────────────────────────────────
// Edits a single option's state_effect: { set, unlock, lock }
// allPhaseInjects: inject objects in this phase (for the unlock/lock selectors)
function StateEffectBuilder({ effect, onChange, allPhaseInjects }) {
    const setPairs = setObjToPairs(effect.set);

    const updateSet = (pairs) =>
        onChange({ ...effect, set: pairsToSetObj(pairs) });

    const addUnlock = () =>
        onChange({ ...effect, unlock: [...effect.unlock, ""] });
    const updateUnlock = (i, val) =>
        onChange({ ...effect, unlock: effect.unlock.map((v, j) => j === i ? val : v) });
    const removeUnlock = (i) =>
        onChange({ ...effect, unlock: effect.unlock.filter((_, j) => j !== i) });

    const addLock = () =>
        onChange({ ...effect, lock: [...effect.lock, ""] });
    const updateLock = (i, val) =>
        onChange({ ...effect, lock: effect.lock.map((v, j) => j === i ? val : v) });
    const removeLock = (i) =>
        onChange({ ...effect, lock: effect.lock.filter((_, j) => j !== i) });

    return (
        <div className="cs-state-effect">
            {/* Set variables */}
            <div className="cs-state-effect__section">
                <div className="cs-state-effect__label">Set variables</div>
                <KVPairList
                    pairs={setPairs}
                    onChange={updateSet}
                    keyPlaceholder="variable"
                    valuePlaceholder="value"
                />
            </div>

            {/* Unlock injects */}
            <div className="cs-state-effect__section">
                <div className="cs-state-effect__label">Unlock evidence</div>
                {effect.unlock.map((injectId, i) => (
                    <div key={i} className="cs-effect-inject-row">
                        <select className="cs-input" value={injectId}
                            onChange={(e) => updateUnlock(i, e.target.value)}>
                            <option value="">Select inject…</option>
                            {allPhaseInjects.map((inj) => (
                                <option key={inj._id} value={inj._id}>
                                    {inj.title || "(untitled inject)"}
                                </option>
                            ))}
                        </select>
                        <button type="button" className="cs-icon-btn cs-icon-btn--danger"
                            onClick={() => removeUnlock(i)}>×</button>
                    </div>
                ))}
                <button type="button" className="cs-add-kv-btn" onClick={addUnlock}>
                    + Unlock inject
                </button>
            </div>

            {/* Lock injects */}
            <div className="cs-state-effect__section">
                <div className="cs-state-effect__label">Lock evidence</div>
                {effect.lock.map((injectId, i) => (
                    <div key={i} className="cs-effect-inject-row">
                        <select className="cs-input" value={injectId}
                            onChange={(e) => updateLock(i, e.target.value)}>
                            <option value="">Select inject…</option>
                            {allPhaseInjects.map((inj) => (
                                <option key={inj._id} value={inj._id}>
                                    {inj.title || "(untitled inject)"}
                                </option>
                            ))}
                        </select>
                        <button type="button" className="cs-icon-btn cs-icon-btn--danger"
                            onClick={() => removeLock(i)}>×</button>
                    </div>
                ))}
                <button type="button" className="cs-add-kv-btn" onClick={addLock}>
                    + Lock inject
                </button>
            </div>
        </div>
    );
}

// ─── Decision option row ──────────────────────────────────────────────────────
function DecisionOption({ option, index, onUpdate, onRemove, allPhaseInjects, canRemove }) {
    const [effectOpen, setEffectOpen] = useState(false);

    const effect = option.state_effect || emptyStateEffect();
    const effectSummary = [
        Object.keys(effect.set || {}).length > 0
            ? `sets ${Object.keys(effect.set).join(", ")}`
            : null,
        (effect.unlock || []).length > 0
            ? `unlocks ${effect.unlock.length} inject${effect.unlock.length !== 1 ? "s" : ""}`
            : null,
        (effect.lock || []).length > 0
            ? `locks ${effect.lock.length} inject${effect.lock.length !== 1 ? "s" : ""}`
            : null,
    ].filter(Boolean).join(" · ");

    return (
        <div className="cs-decision-option">
            <div className="cs-item-row__header">
                <span className="cs-item-row__number">Option {index + 1}</span>
                {canRemove && (
                    <button type="button" className="cs-icon-btn cs-icon-btn--danger"
                        onClick={onRemove}>×</button>
                )}
            </div>

            <div className="cs-row-2col">
                <Field label="Label" required>
                    <input className="cs-input" value={option.label}
                        onChange={(e) => onUpdate({ ...option, label: e.target.value })}
                        placeholder="e.g. Image the disk" />
                </Field>
                <Field label="Time cost (minutes)"
                    hint="Scenario time advances by this amount when chosen.">
                    <input className="cs-input" type="number" min={0}
                        value={option.time_cost_minutes}
                        onChange={(e) => onUpdate({ ...option, time_cost_minutes: parseInt(e.target.value) || 0 })} />
                </Field>
            </div>

            <Field label="Outcome text" hint="Shown immediately after this option is chosen.">
                <textarea className="cs-input cs-textarea" rows={2} value={option.outcome_text}
                    onChange={(e) => onUpdate({ ...option, outcome_text: e.target.value })}
                    placeholder="e.g. Good choice — disk image secured without altering volatile data." />
            </Field>

            {/* State effect builder — collapsible */}
            <div className="cs-state-effect-wrap">
                <button
                    type="button"
                    className="cs-state-effect-toggle"
                    onClick={() => setEffectOpen((o) => !o)}
                >
                    <span>Effects {effectSummary ? `· ${effectSummary}` : "(none)"}</span>
                    <span>{effectOpen ? "▲" : "▼"}</span>
                </button>
                {effectOpen && (
                    <StateEffectBuilder
                        effect={effect}
                        allPhaseInjects={allPhaseInjects}
                        onChange={(upd) => onUpdate({ ...option, state_effect: upd })}
                    />
                )}
            </div>
        </div>
    );
}

// ─── Decision block ───────────────────────────────────────────────────────────
function DecisionBlock({ decision, index, onUpdate, onRemove, allPhaseInjects }) {
    const [expanded, setExpanded] = useState(true);

    const updateOption = (i, upd) =>
        onUpdate({ ...decision, options: decision.options.map((o, j) => j === i ? upd : o) });
    const removeOption = (i) =>
        onUpdate({ ...decision, options: decision.options.filter((_, j) => j !== i) });
    const addOption = () =>
        onUpdate({ ...decision, options: [...decision.options, newDecisionOption()] });

    // Conditions: stored as object on decision, edited via pair list
    const conditionPairs = conditionsObjToPairs(decision.conditions || {});
    const updateConditions = (pairs) =>
        onUpdate({ ...decision, conditions: pairsToConditionsObj(pairs) });

    const timeCosts = decision.options.map((o) => o.time_cost_minutes).filter(Boolean);
    const timeSummary = timeCosts.length
        ? `${Math.min(...timeCosts)}–${Math.max(...timeCosts)} min`
        : "0 min";

    const conditionCount = Object.keys(decision.conditions || {}).length;

    return (
        <div className="cs-decision-block">
            <div className="cs-decision-block__header" onClick={() => setExpanded((e) => !e)}>
                <div className="cs-decision-block__left">
                    <span className="cs-decision-block__label">Decision {index + 1}</span>
                    <span className="cs-decision-block__title">{decision.title || "Untitled"}</span>
                </div>
                <div className="cs-decision-block__right">
                    <span className="cs-chip">⏱ {timeSummary}</span>
                    <span className="cs-chip">{decision.options.length} options</span>
                    {conditionCount > 0 && (
                        <span className="cs-chip cs-chip--condition" title="Has display conditions">
                            {conditionCount} condition{conditionCount !== 1 ? "s" : ""}
                        </span>
                    )}
                    <button type="button" className="cs-icon-btn cs-icon-btn--danger"
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
                    <span className="cs-expand-icon">{expanded ? "▲" : "▼"}</span>
                </div>
            </div>

            {expanded && (
                <div className="cs-decision-block__body">
                    <div className="cs-row-2col">
                        <Field label="Decision title" required>
                            <input className="cs-input" value={decision.title}
                                onChange={(e) => onUpdate({ ...decision, title: e.target.value })}
                                placeholder="e.g. Which device do you process first?" />
                        </Field>
                        <Field label="Release at (scenario minutes)"
                            hint="Scenario time at which this decision is shown to the student.">
                            <input className="cs-input" type="number" min={0}
                                value={decision.release_at_minutes}
                                onChange={(e) => onUpdate({ ...decision, release_at_minutes: parseInt(e.target.value) || 0 })} />
                        </Field>
                    </div>

                    <Field label="Context">
                        <textarea className="cs-input cs-textarea" rows={2} value={decision.description}
                            onChange={(e) => onUpdate({ ...decision, description: e.target.value })}
                            placeholder="Situation description shown before the student chooses…" />
                    </Field>

                    {/* Conditions */}
                    <Field
                        label="Display conditions"
                        hint="This decision is only shown if ALL of these variables match the current attempt state. Leave empty to always show."
                    >
                        <KVPairList
                            pairs={conditionPairs}
                            onChange={updateConditions}
                            keyPlaceholder="variable"
                            valuePlaceholder="expected value"
                        />
                    </Field>

                    {/* Options */}
                    <div className="cs-decision-options">
                        {decision.options.map((opt, i) => (
                            <DecisionOption key={opt._id} option={opt} index={i}
                                canRemove={decision.options.length > 2}
                                allPhaseInjects={allPhaseInjects}
                                onUpdate={(upd) => updateOption(i, upd)}
                                onRemove={() => removeOption(i)} />
                        ))}
                    </div>
                    {decision.options.length < 4 && (
                        <button type="button" className="cs-add-sub-btn" onClick={addOption}>
                            + Add Option
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Low-quality file upload zone ─────────────────────────────────────────────
// Wraps FileUploadZone but maps to the low-quality path fields on the inject.
// FileUploadZone reads/writes inject.file_name, inject.file_path, inject.upload_status.
// We create a synthetic inject-shaped object for it and map back on update.
function LowQualityUploadZone({ inject, onUpdate }) {
    // Present a proxy object to FileUploadZone shaped like a regular inject
    const proxy = {
        ...inject,
        file_name:     inject.file_name_low_quality || "",
        file_type:     inject.file_type_low_quality || "",
        file_size:     inject.file_size_low_quality || null,
        file_path:     inject.file_path_low_quality || "",
        upload_status: inject.upload_status_low_quality || "idle",
        // Suppress title pre-fill by providing a non-blank title
        title: inject.title || " ",
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
                <span className="cs-hint"> — delivered to student when evidence has degraded</span>
            </div>
            <FileUploadZone inject={proxy} onUpdate={handleUpdate} />
        </div>
    );
}

// ─── Inject row with lifetime + volatility + low-quality upload ───────────────
function NarrativeInjectRow({ inject, index, onUpdate, onRemove }) {
    const degradeAt = inject.lifetime_minutes && inject.volatility !== "none"
        ? (inject.lifetime_minutes * (inject.volatility === "high" ? 0.25 : 0.5)).toFixed(1)
        : null;

    const showLowQuality = inject.volatility !== "none";

    return (
        <div className="cs-narrative-inject">
            <InjectRow inject={inject} index={index} onUpdate={onUpdate} onRemove={onRemove} />

            <div className="cs-volatility-row">
                <div className="cs-row-2col" style={{ flex: 1 }}>
                    <Field label="Evidence lifetime (scenario minutes)"
                        hint="Scenario time at which this evidence is fully lost.">
                        <input className="cs-input" type="number" min={1}
                            value={inject.lifetime_minutes}
                            placeholder="e.g. 20"
                            onChange={(e) => onUpdate({ ...inject, lifetime_minutes: parseInt(e.target.value) || "" })} />
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
                {degradeAt && (
                    <span className="cs-volatility-preview">
                        Degrades to low quality at <strong>{degradeAt} min</strong> scenario time,
                        lost at <strong>{inject.lifetime_minutes} min</strong>
                    </span>
                )}
            </div>

            {/* Low-quality upload — only shown when volatility is set */}
            {showLowQuality && (
                <LowQualityUploadZone inject={inject} onUpdate={onUpdate} />
            )}
        </div>
    );
}

// ─── Main NarrativePhaseCard ──────────────────────────────────────────────────
export default function NarrativePhaseCard({ phase, index, total, onUpdate, onRemove, onMove, allPhaseInjects }) {
    const [expanded,  setExpanded]  = useState(phase.expanded ?? true);
    const [activeTab, setActiveTab] = useState("injects");

    const update = (field, value) => onUpdate({ ...phase, [field]: value });

    const addInject    = () => update("injects",   [...phase.injects, newInject()]);
    const updateInject = (i, upd) => update("injects",   phase.injects.map((x, j) => j === i ? upd : x));
    const removeInject = (i) => update("injects",   phase.injects.filter((_, j) => j !== i));

    const addQuestion    = () => update("questions", [...phase.questions, newQuestion()]);
    const updateQuestion = (i, upd) => update("questions", phase.questions.map((x, j) => j === i ? upd : x));
    const removeQuestion = (i) => update("questions", phase.questions.filter((_, j) => j !== i));

    const addDecision    = () => update("decisions", [...(phase.decisions || []), newDecision()]);
    const updateDecision = (i, upd) => update("decisions", phase.decisions.map((x, j) => j === i ? upd : x));
    const removeDecision = (i) => update("decisions", phase.decisions.filter((_, j) => j !== i));

    const tabs = [
        { id: "injects",   label: `Injects (${phase.injects.length})` },
        { id: "decisions", label: `Decisions (${phase.decisions?.length || 0})` },
        { id: "questions", label: `Questions (${phase.questions.length})` },
    ];

    return (
        <div className="cs-phase-card">
            <div className="cs-phase-card__header" onClick={() => setExpanded((e) => !e)}>
                <div className="cs-phase-card__header-left">
                    <span className="cs-phase-num">Phase {index + 1}</span>
                    <span className="cs-phase-title">{phase.title || "Untitled Phase"}</span>
                    <span className="cs-chip">{phase.duration_minutes}min</span>
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
                <div className="cs-phase-card__body">
                    <div className="cs-row-2col">
                        <Field label="Phase title" required>
                            <input className="cs-input" value={phase.title}
                                onChange={(e) => update("title", e.target.value)}
                                placeholder="e.g. On-Site Device Triage" />
                        </Field>
                        <Field label="Duration (minutes)" required>
                            <input className="cs-input" type="number" min={1}
                                value={phase.duration_minutes}
                                onChange={(e) => update("duration_minutes", parseInt(e.target.value) || 0)} />
                        </Field>
                    </div>
                    <Field label="Description">
                        <textarea className="cs-input cs-textarea" rows={2} value={phase.description}
                            onChange={(e) => update("description", e.target.value)}
                            placeholder="Briefing shown to the student at the start of this phase…" />
                    </Field>

                    <div className="cs-phase-tabs">
                        {tabs.map((t) => (
                            <button key={t.id} type="button"
                                className={`cs-phase-tab${activeTab === t.id ? " cs-phase-tab--active" : ""}`}
                                onClick={() => setActiveTab(t.id)}>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {activeTab === "injects" && (
                        <div className="cs-tab-body">
                            {phase.injects.length === 0 && <div className="cs-empty-inline">No injects yet.</div>}
                            {phase.injects.map((inj, i) => (
                                <NarrativeInjectRow key={inj._id} inject={inj} index={i}
                                    onUpdate={(upd) => updateInject(i, upd)}
                                    onRemove={() => removeInject(i)} />
                            ))}
                            <button type="button" className="cs-add-sub-btn" onClick={addInject}>+ Add Inject</button>
                        </div>
                    )}

                    {activeTab === "decisions" && (
                        <div className="cs-tab-body">
                            {(phase.decisions || []).length === 0 && (
                                <div className="cs-empty-inline">No decisions yet. Decisions advance scenario time and can affect evidence.</div>
                            )}
                            {(phase.decisions || []).map((d, i) => (
                                <DecisionBlock key={d._id} decision={d} index={i}
                                    allPhaseInjects={allPhaseInjects}
                                    onUpdate={(upd) => updateDecision(i, upd)}
                                    onRemove={() => removeDecision(i)} />
                            ))}
                            <button type="button" className="cs-add-sub-btn" onClick={addDecision}>+ Add Decision</button>
                        </div>
                    )}

                    {activeTab === "questions" && (
                        <div className="cs-tab-body">
                            {phase.questions.length === 0 && <div className="cs-empty-inline">No questions yet.</div>}
                            {phase.questions.map((q, i) => (
                                <QuestionRow key={q._id} question={q} index={i}
                                    onUpdate={(upd) => updateQuestion(i, upd)}
                                    onRemove={() => removeQuestion(i)} />
                            ))}
                            <button type="button" className="cs-add-sub-btn" onClick={addQuestion}>+ Add Question</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}