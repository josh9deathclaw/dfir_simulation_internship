// src/components/NarrativeEngine/NarrativeEngine.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Student-facing runtime for narrative mode scenarios.
//
// Layout (replaces the open-ended feed + objectives columns):
//
//   ┌─────────────────────────────────────────────────────┐
//   │  TOKEN BAR  — scenario-time units left this phase   │
//   ├──────────────────────┬──────────────────────────────┤
//   │  UNDISCOVERED        │  EXTRACTED                   │
//   │  (hidden — count     │  evidence cards (read-only,  │
//   │   only shown)        │  view in VM note)            │
//   │                      │                              │
//   │  DISCOVERED          │                              │
//   │  evidence cards with │                              │
//   │  quality indicator + │                              │
//   │  [Proper] [Live]     │                              │
//   │  action buttons      │                              │
//   └──────────────────────┴──────────────────────────────┘
//
// Props:
//   phaseInjects   [{...injectRow, trigger from DB}]  — all injects for this phase
//   triggers       [{inject_id, trigger_type, threshold_value, ref_inject_id}]
//   timeBudget     number  — phase.time_budget (max scenario-time units)
//   attemptId      string
//   token          string
//   onScenarioTimeChange(n)  — bubbles up to SimulatorPage for BottomBar display
// ─────────────────────────────────────────────────────────────────────────────
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
    const used    = scenarioTime;
    const left    = Math.max(0, timeBudget - used);
    const pct     = Math.min(100, (used / timeBudget) * 100);
    const critical = pct >= 80;
    const exhausted = left === 0;

    return (
        <div className={`nar-token-bar${critical ? " nar-token-bar--critical" : ""}${exhausted ? " nar-token-bar--exhausted" : ""}`}>
            <div className="nar-token-bar__label">
                <span className="nar-token-bar__slash">// </span>
                SCENARIO TIME
            </div>
            <div className="nar-token-bar__track">
                <div className="nar-token-bar__fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="nar-token-bar__counts">
                <span className={`nar-token-bar__used${critical ? " nar-token-bar__used--critical" : ""}`}>
                    {used}u used
                </span>
                <span className={`nar-token-bar__left${exhausted ? " nar-token-bar__left--zero" : ""}`}>
                    {exhausted ? "BUDGET EXHAUSTED" : `${left}u remaining`}
                </span>
            </div>
        </div>
    );
}

// ─── Quality badge ─────────────────────────────────────────────────────────────
function QualityBadge({ quality }) {
    const cfg = {
        high:      { label: "HIGH QUALITY",  cls: "nar-badge--high" },
        low:       { label: "LOW QUALITY",   cls: "nar-badge--low" },
        destroyed: { label: "DESTROYED",     cls: "nar-badge--destroyed" },
    }[quality] || { label: "UNKNOWN", cls: "" };

    return <span className={`nar-badge ${cfg.cls}`}>{cfg.label}</span>;
}

// ─── Discovered evidence card ─────────────────────────────────────────────────
function DiscoveredCard({ inject, discoveredAt, scenarioTime, timeBudget, onExtract, extracting }) {
    const quality     = computeQuality(inject, scenarioTime, discoveredAt);
    const isDestroyed = quality === "destroyed";
    const budgetGone  = scenarioTime >= timeBudget;

    const fullCost = inject.extraction_cost_full ?? 5;
    const liveCost = inject.extraction_cost_live ?? 2;

    const canFull = !isDestroyed && !budgetGone && (scenarioTime + fullCost <= timeBudget);
    const canLive = !isDestroyed && !budgetGone && (scenarioTime + liveCost <= timeBudget);

    const displayName = inject.file_name || inject.file_path?.split("/").pop() || null;

    // Countdown hint
    let countdownHint = null;
    if (!isDestroyed && inject.volatility !== "none" && inject.lifespan_units) {
        const { degradeAt, destroyAt } = computeThresholds(inject.lifespan_units, inject.volatility);
        const elapsed = scenarioTime - discoveredAt;
        if (quality === "high" && degradeAt != null) {
            const remaining = degradeAt - elapsed;
            countdownHint = remaining > 0
                ? `Degrades in ${remaining}u`
                : "Degrading now";
        } else if (quality === "low") {
            const remaining = destroyAt - elapsed;
            countdownHint = remaining > 0
                ? `Destroyed in ${remaining}u`
                : "Destroying now";
        }
    }

    return (
        <div className={`nar-card nar-card--discovered${isDestroyed ? " nar-card--destroyed" : ""}`}>
            <div className="nar-card__scanline" />
            <div className="nar-card__header">
                <span className="nar-card__prompt">&gt;&gt;</span>
                <span className="nar-card__title">{inject.title}</span>
                <QualityBadge quality={quality} />
            </div>

            {inject.description && (
                <div className="nar-card__desc">{inject.description}</div>
            )}

            {displayName && (
                <div className="nar-card__file">
                    <span className="nar-card__file-name">{displayName}</span>
                </div>
            )}

            {countdownHint && !isDestroyed && (
                <div className={`nar-card__countdown${quality === "low" ? " nar-card__countdown--urgent" : ""}`}>
                    ⏱ {countdownHint}
                </div>
            )}

            {isDestroyed ? (
                <div className="nar-card__destroyed-msg">
                    EVIDENCE DESTROYED — unrecoverable
                </div>
            ) : budgetGone ? (
                <div className="nar-card__budget-msg">
                    BUDGET EXHAUSTED — no actions available
                </div>
            ) : (
                <div className="nar-card__actions">
                    <button
                        className={`nar-action-btn nar-action-btn--full${canFull ? " nar-action-btn--ready" : " nar-action-btn--disabled"}`}
                        disabled={!canFull || extracting}
                        onClick={() => onExtract(inject, "full")}
                        title={`Proper acquisition — costs ${fullCost}u, extracts at current quality`}
                    >
                        <span className="nar-action-btn__label">[ PROPER ACQUISITION ]</span>
                        <span className="nar-action-btn__cost">{fullCost}u</span>
                    </button>
                    <button
                        className={`nar-action-btn nar-action-btn--live${canLive ? " nar-action-btn--ready" : " nar-action-btn--disabled"}`}
                        disabled={!canLive || extracting}
                        onClick={() => onExtract(inject, "live")}
                        title={`Live acquisition — costs ${liveCost}u, always low quality`}
                    >
                        <span className="nar-action-btn__label">[ LIVE ACQUISITION ]</span>
                        <span className="nar-action-btn__cost">{liveCost}u · always low</span>
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Extracted evidence card ──────────────────────────────────────────────────
function ExtractedCard({ inject, qualityAtExtraction, extractionMethod }) {
    const qualityLabel = qualityAtExtraction === "high" ? "HIGH" : "LOW";
    const methodLabel  = extractionMethod === "full" ? "PROPER" : "LIVE";
    const displayName  = inject.file_name || inject.file_path?.split("/").pop() || null;

    return (
        <div className="nar-card nar-card--extracted">
            <div className="nar-card__header">
                <span className="nar-card__prompt">✓</span>
                <span className="nar-card__title">{inject.title}</span>
                <span className={`nar-badge nar-badge--extracted nar-badge--${qualityAtExtraction}`}>
                    {qualityLabel} · {methodLabel}
                </span>
            </div>
            {inject.description && (
                <div className="nar-card__desc">{inject.description}</div>
            )}
            {displayName && (
                <div className="nar-card__file">
                    <span className="nar-card__file-name">{displayName}</span>
                </div>
            )}
            <div className="nar-card__vm-note">
                View evidence in the Forensic Workstation
            </div>
        </div>
    );
}

// ─── Toast notification ───────────────────────────────────────────────────────
function Toast({ messages, onDismiss }) {
    return (
        <div className="nar-toast-stack">
            {messages.map((m) => (
                <div key={m.id} className={`nar-toast nar-toast--${m.type}`}>
                    <span>{m.text}</span>
                    <button className="nar-toast__close" onClick={() => onDismiss(m.id)}>✕</button>
                </div>
            ))}
        </div>
    );
}

// ─── Main NarrativeEngine ─────────────────────────────────────────────────────
export default function NarrativeEngine({
    phaseInjects,
    triggers,
    timeBudget,
    attemptId,
    token,
    onScenarioTimeChange,
}) {
    // scenarioTime is the current scenario-time units for this phase
    const [scenarioTime, setScenarioTime] = useState(0);

    // injectStates: map of inject_id → { status, discoveredAt, qualityAtExtraction, extractionMethod }
    const [injectStates, setInjectStates] = useState({});

    const [extracting,  setExtracting]  = useState(false); // global lock during API call
    const [toasts,      setToasts]      = useState([]);
    const toastIdRef = useRef(0);

    // ── Build trigger lookup ──────────────────────────────────────────────────
    const triggerMap = {};
    (triggers || []).forEach((t) => { triggerMap[t.inject_id] = t; });

    // ── Initialise inject states on mount / phase change ─────────────────────
    useEffect(() => {
        setScenarioTime(0);
        onScenarioTimeChange?.(0);

        const initial = {};
        phaseInjects.forEach((inj) => {
            const trigger = triggerMap[inj.id];
            const isAlways = !trigger || trigger.trigger_type === "always";
            initial[inj.id] = {
                status:              isAlways ? "discovered" : "undiscovered",
                discoveredAt:        isAlways ? 0 : null,
                qualityAtExtraction: null,
                extractionMethod:    null,
            };
        });
        setInjectStates(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phaseInjects]);

    // ── Add toast ─────────────────────────────────────────────────────────────
    const addToast = useCallback((text, type = "info") => {
        const id = ++toastIdRef.current;
        setToasts((prev) => [...prev, { id, text, type }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
    }, []);

    const dismissToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    // ── Extract action ────────────────────────────────────────────────────────
    const handleExtract = useCallback(async (inject, action) => {
        if (extracting || !attemptId) return;
        setExtracting(true);

        try {
            const res = await fetch(
                API(`/attempts/${attemptId}/injects/${inject.id}/extract`),
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        action,
                        scenario_time_current: scenarioTime,
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                addToast(data.message || "Extraction failed", "error");
                return;
            }

            // Update scenario time
            setScenarioTime(data.scenario_time);
            onScenarioTimeChange?.(data.scenario_time);

            // Apply new inject states from server response
            setInjectStates((prev) => {
                const next = { ...prev };

                // Mark extracted inject
                next[inject.id] = {
                    ...next[inject.id],
                    status:              "extracted",
                    qualityAtExtraction: data.quality_delivered,
                    extractionMethod:    action,
                };

                // Mark newly discovered injects
                (data.newly_discovered || []).forEach((newId) => {
                    if (next[newId]) {
                        next[newId] = {
                            ...next[newId],
                            status:       "discovered",
                            discoveredAt: data.scenario_time,
                        };
                    }
                });

                return next;
            });

            // Toast feedback
            const qualityLabel = data.quality_delivered === "high" ? "high quality" : "low quality";
            addToast(
                `${inject.title} extracted at ${qualityLabel} (${action === "full" ? "proper" : "live"} acquisition)`,
                data.quality_delivered === "high" ? "success" : "warn"
            );

            // Announce newly discovered items
            (data.newly_discovered || []).forEach((newId) => {
                const found = phaseInjects.find((i) => i.id === newId);
                if (found) addToast(`New evidence discovered: ${found.title}`, "info");
            });

            if (data.budget_exhausted) {
                addToast("Scenario time budget exhausted — no more actions this phase", "error");
            }

        } catch (err) {
            console.error("NarrativeEngine extract error:", err);
            addToast("Network error — extraction failed", "error");
        } finally {
            setExtracting(false);
        }
    }, [extracting, attemptId, token, scenarioTime, phaseInjects, addToast, onScenarioTimeChange]);

    // ── Categorise injects for render ─────────────────────────────────────────
    const discovered  = phaseInjects.filter((i) => injectStates[i.id]?.status === "discovered");
    const extracted   = phaseInjects.filter((i) => injectStates[i.id]?.status === "extracted");
    const undiscCount = phaseInjects.filter((i) => injectStates[i.id]?.status === "undiscovered").length;

    return (
        <div className="nar-engine">
            <Toast messages={toasts} onDismiss={dismissToast} />

            {/* ── Token bar ─────────────────────────────────────────────── */}
            <TokenBar scenarioTime={scenarioTime} timeBudget={timeBudget} />

            {/* ── Two-column evidence layout ────────────────────────────── */}
            <div className="nar-columns">
                {/* Left — undiscovered count + discovered actionable cards */}
                <div className="nar-col nar-col--left">
                    <div className="nar-col__header">
                        <span className="nar-col__slash">// </span>
                        EVIDENCE FEED
                        {undiscCount > 0 && (
                            <span className="nar-col__pending">
                                {undiscCount} PENDING DISCOVERY
                            </span>
                        )}
                    </div>

                    {discovered.length === 0 ? (
                        <div className="nar-col__empty">
                            <div className="nar-col__empty-icon">◈</div>
                            <div>AWAITING EVIDENCE</div>
                            <div className="nar-col__empty-sub">
                                {undiscCount > 0
                                    ? "Extract existing evidence to unlock more"
                                    : "No evidence available this phase"}
                            </div>
                        </div>
                    ) : (
                        <div className="nar-col__list">
                            {discovered.map((inj) => (
                                <DiscoveredCard
                                    key={inj.id}
                                    inject={inj}
                                    discoveredAt={injectStates[inj.id]?.discoveredAt ?? 0}
                                    scenarioTime={scenarioTime}
                                    timeBudget={timeBudget}
                                    onExtract={handleExtract}
                                    extracting={extracting}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Right — extracted (read-only) */}
                <div className="nar-col nar-col--right">
                    <div className="nar-col__header">
                        <span className="nar-col__slash">// </span>
                        EXTRACTED ({extracted.length})
                    </div>

                    {extracted.length === 0 ? (
                        <div className="nar-col__empty">
                            <div className="nar-col__empty-icon">◇</div>
                            <div>NO EXTRACTIONS YET</div>
                            <div className="nar-col__empty-sub">
                                Extracted evidence will appear here and in the VM
                            </div>
                        </div>
                    ) : (
                        <div className="nar-col__list">
                            {extracted.map((inj) => {
                                const state = injectStates[inj.id];
                                return (
                                    <ExtractedCard
                                        key={inj.id}
                                        inject={inj}
                                        qualityAtExtraction={state?.qualityAtExtraction}
                                        extractionMethod={state?.extractionMethod}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}