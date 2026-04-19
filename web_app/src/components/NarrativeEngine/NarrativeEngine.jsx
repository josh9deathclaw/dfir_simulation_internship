// src/components/NarrativeEngine/NarrativeEngine.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import "./NarrativeEngine.css";
import { API } from "../../utils/api";

// ─── Quality helpers ──────────────────────────────────────────────────────────
function computeThresholds(lifespanUnits, volatility) {
    if (!lifespanUnits || volatility === "none") return { degradeAt: null, destroyAt: null };
    const mult = volatility === "high" ? 0.25 : 0.5;
    return {
        degradeAt: Math.round(lifespanUnits * mult),
        destroyAt: lifespanUnits,
    };
}

function computeQuality(inject, scenarioTime, discoveredAt) {
    const { lifespan_units, volatility } = inject;
    if (!lifespan_units || volatility === "none") return "high";
    const elapsed = scenarioTime - (discoveredAt ?? 0);
    const { degradeAt, destroyAt } = computeThresholds(lifespan_units, volatility);
    if (elapsed >= destroyAt) return "destroyed";
    if (elapsed >= degradeAt) return "low";
    return "high";
}

// ─── Token Bar ────────────────────────────────────────────────────────────────
function TokenBar({ scenarioTime, timeBudget }) {
    const used      = scenarioTime;
    const left      = Math.max(0, timeBudget - used);
    // Bar shows REMAINING units (decreases as time is spent)
    const remainPct = timeBudget > 0 ? Math.max(0, (left / timeBudget) * 100) : 0;
    const critical  = left <= timeBudget * 0.2 && left > 0;
    const exhausted = left === 0;
    return (
        <div className={`nar-token-bar${critical ? " nar-token-bar--critical" : ""}${exhausted ? " nar-token-bar--exhausted" : ""}`}>
            <div className="nar-token-bar__row">
                <span className="nar-token-bar__label">
                    <span className="nar-token-bar__slash">// </span>SCENARIO TIME BUDGET
                </span>
                <span className={`nar-token-bar__right${exhausted ? " nar-token-bar__right--zero" : ""}`}>
                    {exhausted ? "✕ BUDGET EXHAUSTED" : `${left} / ${timeBudget}u remaining`}
                </span>
            </div>
            <div className="nar-token-bar__track">
                {/* Decreasing bar — full at start, empties as units are spent */}
                <div className="nar-token-bar__fill" style={{ width: `${remainPct}%` }} />
            </div>
            {/* Unit pip markers every 10 units for at-a-glance reading */}
            {timeBudget <= 60 && (
                <div className="nar-token-bar__pips">
                    {Array.from({ length: timeBudget }, (_, i) => i + 1).map(u => (
                        <div key={u}
                            className={`nar-token-pip${u <= left ? " nar-token-pip--active" : " nar-token-pip--spent"}`}
                            title={`${u}u`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Quality badge ────────────────────────────────────────────────────────────
function QualityBadge({ quality }) {
    const cfg = {
        high:      { label: "HIGH QUALITY",  cls: "nar-badge--high" },
        low:       { label: "LOW QUALITY",   cls: "nar-badge--low" },
        destroyed: { label: "DESTROYED",     cls: "nar-badge--destroyed" },
    }[quality] || { label: "UNKNOWN", cls: "" };
    return <span className={`nar-badge ${cfg.cls}`}>{cfg.label}</span>;
}

// ─── Discovered evidence card ─────────────────────────────────────────────────
function DiscoveredCard({ inject, discoveredAt, scenarioTime, timeBudget, onExtract, extracting, isNew }) {
    const quality     = computeQuality(inject, scenarioTime, discoveredAt);
    const isDestroyed = quality === "destroyed";
    const budgetGone  = scenarioTime >= timeBudget;
    const fullCost    = inject.extraction_cost_full ?? 5;
    const liveCost    = inject.extraction_cost_live ?? 2;
    const canFull     = !isDestroyed && !budgetGone && (scenarioTime + fullCost <= timeBudget);
    const canLive     = !isDestroyed && !budgetGone && (scenarioTime + liveCost <= timeBudget);
    const displayName = inject.file_name || inject.file_path?.split("/").pop() || null;

    let countdownHint = null;
    if (!isDestroyed && inject.volatility !== "none" && inject.lifespan_units) {
        const { degradeAt, destroyAt } = computeThresholds(inject.lifespan_units, inject.volatility);
        const elapsed = scenarioTime - discoveredAt;
        if (quality === "high" && degradeAt != null) {
            const rem = degradeAt - elapsed;
            countdownHint = rem > 0 ? `Degrades in ${rem}u` : "Degrading now";
        } else if (quality === "low") {
            const rem = destroyAt - elapsed;
            countdownHint = rem > 0 ? `Destroyed in ${rem}u` : "Destroying now";
        }
    }

    return (
        <div className={`nar-card nar-card--discovered${isDestroyed ? " nar-card--destroyed" : ""}${isNew ? " nar-card--new" : ""}`}>
            <div className="nar-card__top-stripe" />
            <div className="nar-card__header">
                <span className="nar-card__prompt">&gt;&gt;</span>
                <span className="nar-card__title">{inject.title}</span>
                <QualityBadge quality={quality} />
            </div>
            {inject.description && <div className="nar-card__desc">{inject.description}</div>}
            {displayName && (
                <div className="nar-card__file">
                    <span className="nar-card__file-icon">◈</span>
                    <span className="nar-card__file-name">{displayName}</span>
                </div>
            )}
            {countdownHint && !isDestroyed && (
                <div className={`nar-card__countdown${quality === "low" ? " nar-card__countdown--urgent" : ""}`}>
                    ⏱ {countdownHint}
                </div>
            )}
            {isDestroyed ? (
                <div className="nar-card__status-msg nar-card__status-msg--destroyed">
                    ✕ EVIDENCE DESTROYED — unrecoverable
                </div>
            ) : budgetGone ? (
                <div className="nar-card__status-msg nar-card__status-msg--budget">
                    ✕ BUDGET EXHAUSTED — no actions available
                </div>
            ) : (
                <div className="nar-card__actions">
                    <button
                        className={`nar-action-btn nar-action-btn--full${canFull ? " nar-action-btn--ready" : ""}`}
                        disabled={!canFull || extracting}
                        onClick={() => onExtract(inject, "full")}
                    >
                        <span className="nar-action-btn__label">PROPER ACQUISITION</span>
                        <span className="nar-action-btn__cost">{fullCost}u</span>
                    </button>
                    <button
                        className={`nar-action-btn nar-action-btn--live${canLive ? " nar-action-btn--ready" : ""}`}
                        disabled={!canLive || extracting}
                        onClick={() => onExtract(inject, "live")}
                    >
                        <span className="nar-action-btn__label">LIVE ACQUISITION</span>
                        <span className="nar-action-btn__cost">{liveCost}u · low only</span>
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Extracted card ───────────────────────────────────────────────────────────
function ExtractedCard({ inject, qualityAtExtraction, extractionMethod }) {
    const displayName = inject.file_name || inject.file_path?.split("/").pop() || null;
    return (
        <div className="nar-card nar-card--extracted">
            <div className="nar-card__header">
                <span className="nar-card__prompt nar-card__prompt--done">✓</span>
                <span className="nar-card__title">{inject.title}</span>
                <span className={`nar-badge nar-badge--${qualityAtExtraction}`}>
                    {qualityAtExtraction === "high" ? "HIGH" : "LOW"} · {extractionMethod === "full" ? "PROPER" : "LIVE"}
                </span>
            </div>
            {inject.description && <div className="nar-card__desc">{inject.description}</div>}
            {displayName && (
                <div className="nar-card__file">
                    <span className="nar-card__file-icon">◈</span>
                    <span className="nar-card__file-name">{displayName}</span>
                </div>
            )}
            <div className="nar-card__vm-note">Available in Forensic Workstation</div>
        </div>
    );
}

// ─── Objectives panel — reuses sim-objectives CSS classes from SimulatorPage.css
function ObjectivesPanel({ objectives, responses, onSubmitObjective, collapsed, onCollapse }) {
    const main = objectives.filter(o => o.objective_type === "main");
    const side = objectives.filter(o => o.objective_type === "side");
    return (
        <div className={`sim-objectives${collapsed ? " sim-objectives--collapsed" : ""}`}>
            <div className="sim-objectives__header">
                {!collapsed && (
                    <div className="sim-objectives__title">
                        <span className="sim-objectives__title-slash">// </span>OBJECTIVES
                    </div>
                )}
                <button className="sim-objectives__toggle" onClick={onCollapse}
                    title={collapsed ? "Expand" : "Collapse"}>
                    {collapsed ? "◀" : "▶"}
                </button>
            </div>
            {!collapsed && (
                <div className="sim-objectives__body">
                    {objectives.length === 0 && <div className="sim-objectives__empty">NO OBJECTIVES</div>}
                    {main.length > 0 && (
                        <div className="sim-objectives__group">
                            <div className="sim-objectives__group-label sim-objectives__group-label--main">PRIMARY</div>
                            {main.map(obj => (
                                <div key={obj.id} className="sim-obj-row">
                                    <span className="sim-obj-row__bullet sim-obj-row__bullet--main">◇</span>
                                    <span className="sim-obj-row__text">{obj.description}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {side.length > 0 && (
                        <div className="sim-objectives__group">
                            <div className="sim-objectives__group-label sim-objectives__group-label--side">TASKS</div>
                            {side.map(obj => (
                                <SideObjRow key={obj.id} obj={obj}
                                    response={responses[obj.id]}
                                    onSubmit={ans => onSubmitObjective(obj.id, ans)} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function SideObjRow({ obj, response, onSubmit }) {
    const [draft, setDraft] = useState(response?.answer || "");
    const isLocked     = response?.is_locked || false;
    const attemptsUsed = response?.attempts_used || 0;
    const attemptsMax  = obj.max_attempts || null;
    const isCorrect    = response?.is_correct;
    const attemptsLeft = attemptsMax ? attemptsMax - attemptsUsed : null;
    const canSubmit    = !isLocked && draft.trim() && (attemptsLeft === null || attemptsLeft > 0);
    return (
        <div className={`sim-obj-row sim-obj-row--side${isCorrect ? " sim-obj-row--correct" : ""}${(isLocked && !isCorrect) ? " sim-obj-row--locked" : ""}`}>
            <div className="sim-obj-row__side-header">
                <span className="sim-obj-row__bullet sim-obj-row__bullet--side">◈</span>
                <span className="sim-obj-row__text">{obj.description}</span>
            </div>
            <textarea className="sim-obj-row__input" value={draft} rows={2}
                onChange={e => setDraft(e.target.value)}
                placeholder="> enter response..." disabled={isLocked} />
            <div className="sim-obj-row__footer">
                {attemptsMax && (
                    <span className="sim-obj-row__attempts">
                        {isLocked ? "LOCKED" : `${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} left`}
                    </span>
                )}
                {!isLocked && (
                    <button className={`sim-obj-row__submit${canSubmit ? " sim-obj-row__submit--ready" : ""}`}
                        disabled={!canSubmit} onClick={() => onSubmit(draft)}>[ SUBMIT ]</button>
                )}
            </div>
        </div>
    );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ messages, onDismiss }) {
    return (
        <div className="nar-toast-stack">
            {messages.map(m => (
                <div key={m.id} className={`nar-toast nar-toast--${m.type}`}>
                    <span>{m.text}</span>
                    <button className="nar-toast__close" onClick={() => onDismiss(m.id)}>✕</button>
                </div>
            ))}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function NarrativeEngine({
    phaseInjects,
    triggers,
    timeBudget,
    attemptId,
    token,
    onScenarioTimeChange,
    objectives = [],
    objResponses = {},
    onSubmitObjective,
}) {
    const [scenarioTime,  setScenarioTime]  = useState(0);
    const [injectStates,  setInjectStates]  = useState({});
    const [newInjectIds,  setNewInjectIds]  = useState(new Set());
    const [extracting,    setExtracting]    = useState(false);
    const [toasts,        setToasts]        = useState([]);
    const [objCollapsed,  setObjCollapsed]  = useState(false);
    const toastIdRef    = useRef(0);
    // Track which phase we've already initialised so re-renders don't re-fire toasts.
    // Key = sorted inject IDs joined — stable across re-renders for the same phase.
    const initialisedKeyRef = useRef(null);

    const triggerMap = {};
    (triggers || []).forEach(t => { triggerMap[t.inject_id] = t; });

    const addToast = useCallback((text, type = "info") => {
        const id = ++toastIdRef.current;
        setToasts(prev => [...prev, { id, text, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
    }, []);

    const dismissToast = useCallback(id => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // ── Init on phase change ──────────────────────────────────────────────────
    // Derive a stable key from the inject IDs so this effect only fires when
    // the actual phase content changes, not on every parent re-render.
    const phaseKey = phaseInjects.map(i => i.id).sort().join(",");

    useEffect(() => {
        if (!attemptId || !phaseKey) return;
        if (initialisedKeyRef.current === phaseKey) return;
        initialisedKeyRef.current = phaseKey;

        setNewInjectIds(new Set());

        // Load existing DB state first — prevents 409s when resuming an attempt
        // where some injects are already 'extracted' in the database.
        async function initPhase() {
            let dbScenarioTime = 0;
            const dbStates = {};

            try {
                const res = await fetch(API(`/attempts/${attemptId}/injects/state`), {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    dbScenarioTime = data.scenario_time ?? 0;
                    Object.assign(dbStates, data.states ?? {});
                }
            } catch (err) {
                console.warn("[NarrativeEngine] Could not load inject state from DB:", err);
            }

            setScenarioTime(dbScenarioTime);
            onScenarioTimeChange?.(dbScenarioTime);

            // Merge DB state with trigger-derived defaults.
            // DB wins for any inject that already has a row.
            const initial   = {};
            const newlyDiscovered = []; // injects with no DB row → treat as fresh discovered

            phaseInjects.forEach(inj => {
                if (dbStates[inj.id]) {
                    // Rehydrate from DB
                    initial[inj.id] = dbStates[inj.id];
                } else {
                    // No DB row yet — derive from trigger
                    const trigger  = triggerMap[inj.id];
                    const isAlways = !trigger || trigger.trigger_type === "always";
                    initial[inj.id] = {
                        status:              isAlways ? "discovered" : "undiscovered",
                        discoveredAt:        isAlways ? 0 : null,
                        qualityAtExtraction: null,
                        extractionMethod:    null,
                    };
                    if (isAlways) newlyDiscovered.push(inj);
                }
            });

            setInjectStates(initial);

            // Only toast + animate injects that are genuinely new this session
            // (no DB row existed). Already-extracted injects get no toast.
            newlyDiscovered.forEach((inj, idx) => {
                setTimeout(() => {
                    addToast(`Evidence discovered: ${inj.title}`, "info");
                    setNewInjectIds(prev => { const n = new Set(prev); n.add(inj.id); return n; });
                    setTimeout(() => {
                        setNewInjectIds(prev => { const n = new Set(prev); n.delete(inj.id); return n; });
                    }, 3000);
                }, idx * 700);
            });
        }

        initPhase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phaseKey, attemptId]);

    // ── Extract ───────────────────────────────────────────────────────────────
    const handleExtract = useCallback(async (inject, action) => {
        if (extracting || !attemptId) return;
        setExtracting(true);
        try {
            const res = await fetch(
                API(`/attempts/${attemptId}/injects/${inject.id}/extract`),
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ action, scenario_time_current: scenarioTime }),
                }
            );
            const data = await res.json();
            if (!res.ok) { addToast(data.message || "Extraction failed", "error"); return; }

            setScenarioTime(data.scenario_time);
            onScenarioTimeChange?.(data.scenario_time);

            setInjectStates(prev => {
                const next = { ...prev };
                next[inject.id] = {
                    ...next[inject.id],
                    status:              "extracted",
                    qualityAtExtraction: data.quality_delivered,
                    extractionMethod:    action,
                };
                (data.newly_discovered || []).forEach(newId => {
                    if (next[newId]) next[newId] = { ...next[newId], status: "discovered", discoveredAt: data.scenario_time };
                });
                return next;
            });

            addToast(
                `${inject.title} extracted (${data.quality_delivered === "high" ? "high quality" : "low quality"}, ${action === "full" ? "proper" : "live"})`,
                data.quality_delivered === "high" ? "success" : "warn"
            );

            (data.newly_discovered || []).forEach(newId => {
                const found = phaseInjects.find(i => i.id === newId);
                if (!found) return;
                addToast(`New evidence discovered: ${found.title}`, "info");
                setNewInjectIds(prev => { const n = new Set(prev); n.add(newId); return n; });
                setTimeout(() => setNewInjectIds(prev => { const n = new Set(prev); n.delete(newId); return n; }), 3000);
            });

            if (data.budget_exhausted) addToast("Budget exhausted — no more actions this phase", "error");

        } catch (err) {
            console.error("Extract error:", err);
            addToast("Network error — extraction failed", "error");
        } finally {
            setExtracting(false);
        }
    }, [extracting, attemptId, token, scenarioTime, phaseInjects, addToast, onScenarioTimeChange]);

    const discovered  = phaseInjects.filter(i => injectStates[i.id]?.status === "discovered");
    const extracted   = phaseInjects.filter(i => injectStates[i.id]?.status === "extracted");
    const undiscCount = phaseInjects.filter(i => injectStates[i.id]?.status === "undiscovered").length;

    return (
        <div className="nar-engine">
            <Toast messages={toasts} onDismiss={dismissToast} />
            <TokenBar scenarioTime={scenarioTime} timeBudget={timeBudget} />

            <div className="nar-main">
                {/* Left — discovered evidence */}
                <div className="nar-col nar-col--left">
                    <div className="nar-col__header">
                        <span className="nar-col__slash">// </span>EVIDENCE FEED
                        {undiscCount > 0 && <span className="nar-col__pending">{undiscCount} PENDING</span>}
                    </div>
                    {discovered.length === 0 ? (
                        <div className="nar-col__empty">
                            <div className="nar-col__empty-icon">◈</div>
                            <div>AWAITING EVIDENCE</div>
                            <div className="nar-col__empty-sub">
                                {undiscCount > 0 ? "Extract evidence to unlock more" : "No evidence this phase"}
                            </div>
                        </div>
                    ) : (
                        <div className="nar-col__list">
                            {discovered.map(inj => (
                                <DiscoveredCard key={inj.id} inject={inj}
                                    discoveredAt={injectStates[inj.id]?.discoveredAt ?? 0}
                                    scenarioTime={scenarioTime} timeBudget={timeBudget}
                                    onExtract={handleExtract} extracting={extracting}
                                    isNew={newInjectIds.has(inj.id)} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Right — extracted */}
                <div className="nar-col nar-col--right">
                    <div className="nar-col__header">
                        <span className="nar-col__slash">// </span>EXTRACTED ({extracted.length})
                    </div>
                    {extracted.length === 0 ? (
                        <div className="nar-col__empty">
                            <div className="nar-col__empty-icon">◇</div>
                            <div>NO EXTRACTIONS YET</div>
                            <div className="nar-col__empty-sub">Extracted evidence appears here and in the VM</div>
                        </div>
                    ) : (
                        <div className="nar-col__list">
                            {extracted.map(inj => (
                                <ExtractedCard key={inj.id} inject={inj}
                                    qualityAtExtraction={injectStates[inj.id]?.qualityAtExtraction}
                                    extractionMethod={injectStates[inj.id]?.extractionMethod} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Objectives — reuses SimulatorPage.css classes */}
                <ObjectivesPanel
                    objectives={objectives}
                    responses={objResponses}
                    onSubmitObjective={onSubmitObjective || (() => {})}
                    collapsed={objCollapsed}
                    onCollapse={() => setObjCollapsed(v => !v)}
                />
            </div>
        </div>
    );
}