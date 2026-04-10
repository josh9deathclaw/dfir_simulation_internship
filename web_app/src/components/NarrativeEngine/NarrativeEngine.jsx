// src/components/NarrativeEngine/NarrativeEngine.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Drop-in overlay for SimulatorPage when scenario.mode === 'narrative'.
//
// Key design rules:
//   1. handleChoose receives the full decision as a parameter — no stale
//      closure on pendingDecision.
//   2. Decisions are only marked "shown" after they PASS their conditions check,
//      not simply because their release time was reached. This allows a decision
//      to stay eligible until state makes its conditions true.
//   3. state_effect unlock/lock targets support "$variableName" references —
//      the engine resolves these against attemptState at the moment of choice,
//      so teachers can express "unlock whichever inject wasn't chosen" without
//      duplicating decisions.
//   4. All backend calls are fire-and-forget — a network failure logs a warning
//      but never freezes the UI.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from "react";
import { API } from "../../utils/api";
import { getEvidenceStatus } from "../CreateScenario/CreateEditScenarioLogic";
import "./NarrativeEngine.css";

const STATUS_COLORS = {
    stable:   { bar: "#52b788", label: "STABLE",   text: "#52b788" },
    at_risk:  { bar: "#f4a261", label: "AT RISK",  text: "#f4a261" },
    critical: { bar: "#e63946", label: "CRITICAL", text: "#e63946" },
    lost:     { bar: "#444",    label: "LOST",      text: "#666"   },
};

// ─── Pure helpers (no React) ───────────────────────────────────────────────────

// Returns true if all key-value pairs in conditions are satisfied by attemptState.
// Empty / null conditions → always true.
function conditionsMatch(conditions, attemptState) {
    if (!conditions || Object.keys(conditions).length === 0) return true;
    return Object.entries(conditions).every(([k, v]) => attemptState[k] === v);
}

// Resolve a single inject-ID entry that may be a literal UUID or a $variable
// reference. Returns the resolved inject ID string, or null if unresolvable.
function resolveInjectRef(ref, attemptState) {
    if (!ref) return null;
    if (typeof ref === "string" && ref.startsWith("$")) {
        const varName = ref.slice(1);
        return attemptState[varName] ?? null;
    }
    return ref;
}

// Apply a state_effect to the current attemptState and return the pieces
// needed to mutate UI state.
//   nextState  — new attempt state object (merged copy, or same ref if no sets)
//   toUnlock   — resolved inject IDs to add to discovered list
//   toLock     — resolved inject IDs to remove from discovered list
function applyStateEffect(effect, attemptState) {
    if (!effect) return { nextState: attemptState, toUnlock: [], toLock: [] };

    const nextState = effect.set && Object.keys(effect.set).length > 0
        ? { ...attemptState, ...effect.set }
        : attemptState;

    const toUnlock = (Array.isArray(effect.unlock) ? effect.unlock : [])
        .map(ref => resolveInjectRef(ref, nextState))  // resolve after applying set
        .filter(Boolean);

    const toLock = (Array.isArray(effect.lock) ? effect.lock : [])
        .map(ref => resolveInjectRef(ref, nextState))
        .filter(Boolean);

    return { nextState, toUnlock, toLock };
}

// ─── Volatility bar ────────────────────────────────────────────────────────────
function VolatilityBar({ inject, scenarioTime }) {
    const { status, qualityLabel } = getEvidenceStatus(inject, scenarioTime);
    const colors = STATUS_COLORS[status];

    let fillPct = 100;
    if (inject.lifetime_minutes && inject.volatility !== "none") {
        fillPct = Math.max(0, Math.min(100,
            100 * (1 - scenarioTime / inject.lifetime_minutes)
        ));
    }

    const degradeThresholdPct = inject.volatility === "high" ? 25
        : inject.volatility === "average" ? 50
        : null;

    return (
        <div className="ne-vol-bar-wrap">
            <div className="ne-vol-bar-track">
                <div
                    className={`ne-vol-bar-fill ne-vol-bar-fill--${status}`}
                    style={{ width: `${fillPct}%`, background: colors.bar }}
                />
                {degradeThresholdPct !== null && (
                    <div className="ne-vol-marker"
                        style={{ left: `${100 - degradeThresholdPct}%` }}
                        title="Quality degrades here" />
                )}
            </div>
            <div className="ne-vol-bar-labels">
                <span className="ne-vol-status" style={{ color: colors.text }}>{colors.label}</span>
                {status !== "lost" && <span className="ne-vol-quality">{qualityLabel} quality</span>}
            </div>
        </div>
    );
}

// ─── Discovered evidence card ──────────────────────────────────────────────────
function DiscoveredCard({ inject, scenarioTime, onExtract, extracting }) {
    const { status } = getEvidenceStatus(inject, scenarioTime);
    const isLost = status === "lost";
    return (
        <div className={`ne-evidence-card ne-evidence-card--discovered ne-evidence-card--${status}`}>
            <div className="ne-evidence-card__header">
                <span className="ne-evidence-card__name">{inject.title}</span>
                {isLost
                    ? <span className="ne-evidence-card__badge ne-evidence-card__badge--lost">LOST</span>
                    : <button className="ne-extract-btn"
                        disabled={extracting}
                        onClick={() => onExtract(inject)}>
                        {extracting ? "EXTRACTING…" : "EXTRACT →"}
                      </button>
                }
            </div>
            {inject.description && <p className="ne-evidence-card__desc">{inject.description}</p>}
            {inject.volatility !== "none"
                ? <VolatilityBar inject={inject} scenarioTime={scenarioTime} />
                : <span className="ne-evidence-card__stable">◆ Stable — no degradation</span>
            }
        </div>
    );
}

// ─── Extracted evidence card ───────────────────────────────────────────────────
function ExtractedCard({ inject, qualityAtExtraction }) {
    const color = qualityAtExtraction === "Low" ? "#f4a261" : "#52b788";
    return (
        <div className="ne-evidence-card ne-evidence-card--extracted">
            <div className="ne-evidence-card__header">
                <span className="ne-evidence-card__name">{inject.title}</span>
                <span className="ne-evidence-card__badge" style={{ color, borderColor: color }}>
                    {qualityAtExtraction} quality
                </span>
            </div>
            {inject.description && <p className="ne-evidence-card__desc">{inject.description}</p>}
            <span className="ne-evidence-card__frozen">◆ Extracted — quality frozen</span>
        </div>
    );
}

// ─── Decision modal ────────────────────────────────────────────────────────────
const DECISION_TIMEOUT = 30;

// onChoose receives (option, decision) — both passed explicitly so the parent
// callback never needs to close over pendingDecision.
function DecisionModal({ decision, onChoose, choosing }) {
    const [timeLeft, setTimeLeft] = useState(DECISION_TIMEOUT);
    const [selectedId, setSelectedId] = useState(null);

    // Auto-choose first option on timeout
    useEffect(() => {
        if (timeLeft <= 0) {
            onChoose(decision.options[0], decision);
            return;
        }
        const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
        return () => clearTimeout(t);
    }, [timeLeft, decision, onChoose]);

    const urgency = timeLeft <= 10 ? "critical" : timeLeft <= 20 ? "warning" : "normal";
    const pct = (timeLeft / DECISION_TIMEOUT) * 100;

    return (
        <div className="ne-decision-backdrop">
            <div className="ne-decision-modal">
                <div className="ne-decision-timer-track">
                    <div
                        className={`ne-decision-timer-fill ne-decision-timer-fill--${urgency}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <div className="ne-decision-header">
                    <span className="ne-decision-label">// DECISION REQUIRED</span>
                    <span className={`ne-decision-countdown ne-decision-countdown--${urgency}`}>
                        {timeLeft}s
                    </span>
                </div>
                <h2 className="ne-decision-title">{decision.title}</h2>
                {decision.description && (
                    <p className="ne-decision-desc">{decision.description}</p>
                )}
                <div className="ne-decision-options">
                    {decision.options.map((opt) => {
                        const optId = opt.id || opt._id;
                        return (
                            <button
                                key={optId}
                                className={`ne-decision-option${selectedId === optId ? " ne-decision-option--selected" : ""}`}
                                disabled={choosing}
                                onClick={() => {
                                    setSelectedId(optId);
                                    onChoose(opt, decision);
                                }}
                            >
                                <div className="ne-decision-option__label">{opt.label}</div>
                                <div className="ne-decision-option__meta">
                                    <span className="ne-decision-option__time">
                                        ⏱ +{opt.time_cost_minutes} min scenario time
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ─── Feedback card ─────────────────────────────────────────────────────────────
function FeedbackCard({ feedback, onDismiss }) {
    return (
        <div className="ne-feedback-backdrop" onClick={onDismiss}>
            <div className="ne-feedback-card" onClick={e => e.stopPropagation()}>
                <div className="ne-feedback-header">
                    <span className="ne-feedback-label">// DECISION OUTCOME</span>
                </div>
                {feedback.outcomeText && (
                    <p className="ne-feedback-outcome">{feedback.outcomeText}</p>
                )}
                {feedback.unlocked.length > 0 && (
                    <div className="ne-feedback-section ne-feedback-section--ok">
                        <div className="ne-feedback-section-title">▶ Evidence discovered</div>
                        {feedback.unlocked.map(inj => (
                            <div key={inj.id || inj._id} className="ne-feedback-item">
                                <span>{inj.title}</span>
                                <span className="ne-feedback-item__status">→ Available</span>
                            </div>
                        ))}
                    </div>
                )}
                {feedback.degraded.length > 0 && (
                    <div className="ne-feedback-section ne-feedback-section--warn">
                        <div className="ne-feedback-section-title">⚠ Evidence degraded</div>
                        {feedback.degraded.map(inj => (
                            <div key={inj.id || inj._id} className="ne-feedback-item">
                                <span>{inj.title}</span>
                                <span className="ne-feedback-item__status">→ Low quality</span>
                            </div>
                        ))}
                    </div>
                )}
                {feedback.lost.length > 0 && (
                    <div className="ne-feedback-section ne-feedback-section--danger">
                        <div className="ne-feedback-section-title">✕ Evidence lost</div>
                        {feedback.lost.map(inj => (
                            <div key={inj.id || inj._id} className="ne-feedback-item">
                                <span>{inj.title}</span>
                                <span className="ne-feedback-item__status">→ Unrecoverable</span>
                            </div>
                        ))}
                    </div>
                )}
                {feedback.unlocked.length === 0 && feedback.degraded.length === 0 && feedback.lost.length === 0 && (
                    <div className="ne-feedback-section ne-feedback-section--ok">
                        <div className="ne-feedback-section-title">✓ No evidence affected</div>
                    </div>
                )}
                <button className="ne-feedback-dismiss" onClick={onDismiss}>[ CONTINUE ]</button>
            </div>
        </div>
    );
}

// ─── Main NarrativeEngine ──────────────────────────────────────────────────────
export default function NarrativeEngine({
    allInjects,
    decisions,
    attemptId,
    token,
    onInjectReleased,
    onScenarioTimeChange,
}) {
    const [scenarioTime,      setScenarioTime]      = useState(0);
    const [discoveredInjects, setDiscoveredInjects] = useState([]);
    const [extractedInjects,  setExtractedInjects]  = useState([]);
    const [decisionQueue,     setDecisionQueue]     = useState([]);  // ordered queue of pending decisions
    const [choosing,          setChoosing]          = useState(false);
    const [feedback,          setFeedback]          = useState(null);
    const [extracting,        setExtracting]        = useState(null);

    // Key-value state store for this attempt.
    // We keep a ref in sync with state so callbacks always read the latest value
    // without needing to be in useCallback dependency arrays.
    const [attemptState, setAttemptState] = useState({});
    const attemptStateRef = useRef({});

    // Track which decisions have already been shown.
    // A decision is added here ONLY after passing its conditions check and being
    // queued — not simply because its release time was reached.
    const shownDecisionsRef = useRef(new Set());

    // Keep refs in sync so timers and callbacks always read fresh values
    const scenarioTimeRef      = useRef(0);
    const discoveredInjectsRef = useRef([]);

    useEffect(() => { scenarioTimeRef.current = scenarioTime; }, [scenarioTime]);
    useEffect(() => { discoveredInjectsRef.current = discoveredInjects; }, [discoveredInjects]);
    useEffect(() => { attemptStateRef.current = attemptState; }, [attemptState]);

    // ── Load persisted attempt state on mount ────────────────────────────────
    useEffect(() => {
        if (!attemptId || !token) return;
        fetch(API(`/attempts/${attemptId}/state`), {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.state && Object.keys(data.state).length > 0) {
                    setAttemptState(data.state);
                    attemptStateRef.current = data.state;
                }
            })
            .catch(() => {/* non-fatal — start with empty state */});
    }, [attemptId, token]);

    // ── Bubble scenario time up to SimulatorPage for BottomBar ──────────────
    useEffect(() => {
        onScenarioTimeChange?.(scenarioTime);
    }, [scenarioTime, onScenarioTimeChange]);

    // ── Decision eligibility check ───────────────────────────────────────────
    // Runs whenever scenarioTime or attemptState changes.
    // A decision is queued when:
    //   1. Its release_at_minutes <= current scenarioTime
    //   2. Its conditions all match current attemptState
    //   3. It has not already been shown
    // The queue is ordered so decisions fire one at a time in release order.
    useEffect(() => {
        if (!decisions?.length) return;

        const toQueue = [];
        decisions.forEach(d => {
            const id = d.id || d._id;
            if (shownDecisionsRef.current.has(id)) return;
            if (scenarioTime < (d.release_at_minutes ?? 0)) return;
            if (!conditionsMatch(d.conditions, attemptState)) return;

            // Mark shown now — conditions are met and we're queuing it
            shownDecisionsRef.current.add(id);
            toQueue.push(d);
        });

        if (toQueue.length > 0) {
            // Sort by release_at_minutes so earlier decisions queue first
            toQueue.sort((a, b) => (a.release_at_minutes ?? 0) - (b.release_at_minutes ?? 0));
            setDecisionQueue(prev => [...prev, ...toQueue]);
        }
    }, [scenarioTime, attemptState, decisions]);

    // ── Persist state variables to backend (fire-and-forget) ─────────────────
    const persistAttemptState = useCallback((updates) => {
        if (!updates || Object.keys(updates).length === 0) return;
        fetch(API(`/attempts/${attemptId}/state`), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ updates }),
        }).catch(err => console.warn("[NarrativeEngine] Failed to persist state:", err));
    }, [attemptId, token]);

    // ── Handle a decision choice ─────────────────────────────────────────────
    // Receives (option, decision) explicitly — no stale closure on decisionQueue.
    const handleChoose = useCallback((option, decision) => {
        setChoosing(true);

        // Read latest values from refs to avoid stale closure issues
        const currentTime     = scenarioTimeRef.current;
        const currentState    = attemptStateRef.current;
        const currentDiscovered = discoveredInjectsRef.current;

        const timeAfter = currentTime + (option.time_cost_minutes || 0);

        // 1. Apply state_effect — compute new state and resolved inject changes.
        //    Variable references ($varName) in unlock/lock arrays are resolved
        //    against nextState (after applying set), so a single decision can
        //    set a variable and immediately use it to unlock an inject.
        const effect = option.state_effect || {};
        const { nextState, toUnlock, toLock } = applyStateEffect(effect, currentState);

        // 2. Persist state variable changes fire-and-forget.
        if (nextState !== currentState) {
            persistAttemptState(effect.set || {});
            setAttemptState(nextState);
            // Update ref immediately so the decision-queue effect can use it
            attemptStateRef.current = nextState;
        }

        // 3. Determine which already-discovered injects changed status due to
        //    the time advance. Compute before mutating discovered list.
        const degraded = [];
        const lost     = [];
        currentDiscovered.forEach(inj => {
            const before = getEvidenceStatus(inj, currentTime).status;
            const after  = getEvidenceStatus(inj, timeAfter).status;
            if (after === "lost"     && before !== "lost")     lost.push(inj);
            else if (after === "critical" && before !== "critical") degraded.push(inj);
        });

        // 4. Apply unlock/lock effects.
        const newlyDiscovered = [];
        const alreadyIds = new Set(currentDiscovered.map(i => i.id || i._id));

        toUnlock.forEach(injectId => {
            const target = allInjects.find(inj =>
                (inj.id || inj._id) === injectId
            );
            if (target && !alreadyIds.has(injectId)) {
                newlyDiscovered.push(target);
                // Deliver file to VM at current quality (before time advance)
                const { qualityLabel } = getEvidenceStatus(target, currentTime);
                onInjectReleased?.({ inject: target, quality: qualityLabel });
            }
        });

        let nextDiscovered = [
            ...currentDiscovered.filter(inj => !toLock.includes(inj.id || inj._id)),
            ...newlyDiscovered,
        ];

        setDiscoveredInjects(nextDiscovered);
        discoveredInjectsRef.current = nextDiscovered;

        // 5. Advance scenario time
        setScenarioTime(timeAfter);
        scenarioTimeRef.current = timeAfter;

        // 6. Record the decision on the backend (fire-and-forget)
        fetch(API(`/attempts/${attemptId}/decisions`), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                decision_id:          decision.id || decision._id,
                chosen_option_id:     option.id || option._id,
                scenario_time_before: currentTime,
                time_cost_minutes:    option.time_cost_minutes,
            }),
        }).catch(err => console.warn("[NarrativeEngine] Failed to record decision:", err));

        // 7. Dequeue this decision and clear choosing state
        setDecisionQueue(prev => prev.filter(d => (d.id || d._id) !== (decision.id || decision._id)));
        setChoosing(false);

        // 8. Show feedback
        setFeedback({
            outcomeText: option.outcome_text,
            unlocked: newlyDiscovered,
            degraded,
            lost,
        });
    }, [allInjects, attemptId, token, onInjectReleased, persistAttemptState]);

    // ── Extract an inject — freezes its quality at current scenario time ──────
    const handleExtract = useCallback((inject) => {
        const { qualityLabel } = getEvidenceStatus(inject, scenarioTimeRef.current);
        const injectId = inject.id || inject._id;
        setExtracting(injectId);

        fetch(API(`/attempts/${attemptId}/injects/${injectId}/extract`), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ quality: qualityLabel, scenario_time: scenarioTimeRef.current }),
        }).catch(err => console.warn("[NarrativeEngine] Failed to record extraction:", err));

        // Deliver correct quality file to VM
        onInjectReleased?.({ inject, quality: qualityLabel });

        setDiscoveredInjects(prev => {
            const next = prev.filter(i => (i.id || i._id) !== injectId);
            discoveredInjectsRef.current = next;
            return next;
        });
        setExtractedInjects(prev => [...prev, { inject, qualityAtExtraction: qualityLabel }]);
        setExtracting(null);
    }, [attemptId, token, onInjectReleased]);

    // The decision currently being presented is the head of the queue,
    // but only if feedback is not showing (feedback must be dismissed first)
    const pendingDecision = !feedback && decisionQueue.length > 0 ? decisionQueue[0] : null;

    return (
        <>
            <div className="ne-panels">
                {/* Left: discovered */}
                <div className="ne-panel ne-panel--discovered">
                    <div className="ne-panel__header">
                        <span className="ne-panel__title">// DISCOVERED EVIDENCE</span>
                        <span className="ne-panel__count">{discoveredInjects.length}</span>
                    </div>
                    <div className="ne-panel__body">
                        {discoveredInjects.length === 0
                            ? <div className="ne-panel__empty">Evidence appears here when discovered…</div>
                            : discoveredInjects.map(inj => (
                                <DiscoveredCard
                                    key={inj.id || inj._id}
                                    inject={inj}
                                    scenarioTime={scenarioTime}
                                    onExtract={handleExtract}
                                    extracting={extracting === (inj.id || inj._id)}
                                />
                            ))
                        }
                    </div>
                </div>

                {/* Right: extracted */}
                <div className="ne-panel ne-panel--extracted">
                    <div className="ne-panel__header">
                        <span className="ne-panel__title">// EXTRACTED EVIDENCE</span>
                        <span className="ne-panel__count">{extractedInjects.length}</span>
                    </div>
                    <div className="ne-panel__body">
                        {extractedInjects.length === 0
                            ? <div className="ne-panel__empty">Extracted evidence appears here.</div>
                            : extractedInjects.map(({ inject, qualityAtExtraction }) => (
                                <ExtractedCard
                                    key={inject.id || inject._id}
                                    inject={inject}
                                    qualityAtExtraction={qualityAtExtraction}
                                />
                            ))
                        }
                    </div>
                </div>
            </div>

            {pendingDecision && (
                <DecisionModal
                    decision={pendingDecision}
                    onChoose={handleChoose}
                    choosing={choosing}
                />
            )}

            {feedback && (
                <FeedbackCard
                    feedback={feedback}
                    onDismiss={() => {
                        setFeedback(null);
                        // After dismissing feedback, the next queued decision
                        // (if any) will automatically appear via pendingDecision
                    }}
                />
            )}
        </>
    );
}