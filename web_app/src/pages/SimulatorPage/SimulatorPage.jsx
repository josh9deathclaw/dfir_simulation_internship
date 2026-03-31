import React, { useState, useEffect, useRef, useCallback } from "react";
import "./SimulatorPage.css";
import { useParams, useNavigate } from "react-router-dom";
import { getToken } from "../../utils/auth";
import VMPanel from '../SimulatorPage/VMPanel';
import InvestigationBoard from '../../components/InvestigationBoard/InvestigationBoard';
import { API } from "../../utils/api";

// ─── Utility helpers ───────────────────────────────────────────────────────────
function formatTime(seconds) {
    if (seconds <= 0) return "00:00";
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
}

function formatTimestamp() {
    return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function getFileTypeColor(type) {
    const map = {
        "Network Capture": "#4cc9f0",
        "Log File":        "#52b788",
        "Memory Dump":     "#f4a261",
        "Disk Image":      "#f72585",
        "PDF Document":    "#ffd166",
        "Event Log":       "#52b788",
        "Image":           "#f72585",
    };
    return map[type] || "#9d9d9d";
}

// ─── Inject Card ──────────────────────────────────────────────────────────────
function InjectCard({ inject, isNew }) {
    const color       = getFileTypeColor(inject.file_type);
    const displayName = inject.file_name || inject.file_path?.split("/").pop() || null;

    // File retrieval handled automatically via VM inject delivery.

    return (
        <div className={`sim-inject${isNew ? " sim-inject--new" : ""}`}>
            <div className="sim-inject__scanline" />
            <div className="sim-inject__header">
                <span className="sim-inject__prompt">&gt;&gt;</span>
                <span className="sim-inject__tag">INCOMING TRANSMISSION</span>
                <span className="sim-inject__time">[{inject.receivedAt}]</span>
            </div>
            <div className="sim-inject__body">
                <div className="sim-inject__title">{inject.title}</div>
                <div className="sim-inject__desc">{inject.description}</div>
                {displayName && (
                    <div className="sim-inject__file">
                        <span className="sim-inject__file-badge" style={{ borderColor: color, color }}>
                            {inject.file_type || "FILE"}
                        </span>
                        <span className="sim-inject__file-name">{displayName}</span>
                    </div>
                )}
            </div>
            <div className="sim-inject__border-flash" style={{ "--flash-color": color }} />
        </div>
    );
}

// ─── Objectives Panel ─────────────────────────────────────────────────────────
function ObjectivesPanel({ objectives, onSubmitObjective, responses, collapsed, onCollapse }) {
    const main = objectives.filter(o => o.objective_type === "main");
    const side = objectives.filter(o => o.objective_type === "side");

    return (
        <div className={`sim-objectives${collapsed ? " sim-objectives--collapsed" : ""}`}>
            <div className="sim-objectives__header">
                {!collapsed && (
                    <div className="sim-objectives__title">
                        <span className="sim-objectives__title-slash">// </span>
                        OBJECTIVES
                    </div>
                )}
                <button
                    className="sim-objectives__toggle"
                    onClick={onCollapse}
                    title={collapsed ? "Expand objectives" : "Collapse objectives"}
                >
                    {collapsed ? "◀" : "▶"}
                </button>
            </div>

            {!collapsed && (
                <div className="sim-objectives__body">
                    {objectives.length === 0 && (
                        <div className="sim-objectives__empty">NO OBJECTIVES</div>
                    )}

                    {main.length > 0 && (
                        <div className="sim-objectives__group">
                            <div className="sim-objectives__group-label sim-objectives__group-label--main">
                                PRIMARY
                            </div>
                            {main.map(obj => (
                                <MainObjectiveRow key={obj.id} obj={obj} />
                            ))}
                        </div>
                    )}

                    {side.length > 0 && (
                        <div className="sim-objectives__group">
                            <div className="sim-objectives__group-label sim-objectives__group-label--side">
                                TASKS
                            </div>
                            {side.map(obj => (
                                <SideObjectiveRow
                                    key={obj.id}
                                    obj={obj}
                                    response={responses[obj.id]}
                                    onSubmit={(answer) => onSubmitObjective(obj.id, answer)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Main objectives are purely read-only reference guides
function MainObjectiveRow({ obj }) {
    return (
        <div className="sim-obj-row">
            <span className="sim-obj-row__bullet sim-obj-row__bullet--main">◇</span>
            <span className="sim-obj-row__text">{obj.description}</span>
        </div>
    );
}

// Side objectives have a text input, submit button, attempt tracking, and scoring feedback
function SideObjectiveRow({ obj, response, onSubmit }) {
    const [draft, setDraft] = React.useState(response?.answer || "");
    const isLocked      = response?.is_locked || false;
    const attemptsUsed  = response?.attempts_used || 0;
    const attemptsMax   = obj.max_attempts || null;
    const hasCorrect    = !!obj.correct_answer;
    const isCorrect     = response?.is_correct;
    const attemptsLeft  = attemptsMax ? attemptsMax - attemptsUsed : null;
    const canSubmit     = !isLocked && draft.trim() && (attemptsLeft === null || attemptsLeft > 0);

    // Scoring display
    let scoreDisplay = null;
    if (hasCorrect && response) {
        if (isCorrect) {
            scoreDisplay = <span className="sim-obj-score sim-obj-score--correct">1/1 ◆</span>;
        } else if (isLocked || attemptsLeft === 0) {
            scoreDisplay = <span className="sim-obj-score sim-obj-score--wrong">0/1 ✕</span>;
        }
    }

    return (
        <div className={`sim-obj-row sim-obj-row--side${isCorrect ? " sim-obj-row--correct" : ""}${(isLocked && !isCorrect) ? " sim-obj-row--locked" : ""}`}>
            <div className="sim-obj-row__side-header">
                <span className="sim-obj-row__bullet sim-obj-row__bullet--side">◈</span>
                <span className="sim-obj-row__text">{obj.description}</span>
                {scoreDisplay}
            </div>
            <textarea
                className="sim-obj-row__input"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="> enter response..."
                rows={2}
                disabled={isLocked}
            />
            <div className="sim-obj-row__footer">
                {attemptsMax && (
                    <span className="sim-obj-row__attempts">
                        {isLocked ? "LOCKED" : `${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} left`}
                    </span>
                )}
                {!isLocked && (
                    <button
                        className={`sim-obj-row__submit${canSubmit ? " sim-obj-row__submit--ready" : ""}`}
                        disabled={!canSubmit}
                        onClick={() => onSubmit(draft)}
                    >
                        [ SUBMIT ]
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Bottom Bar ───────────────────────────────────────────────────────────────
function BottomBar({
    phase, phaseIndex, totalPhases, timeLeft,
    isTimerFrozen, gatesTotal, gatesDone,
    onOpenOverview, onOpenBoard,
}) {
    const timerCritical = timeLeft < 120 && !isTimerFrozen;

    return (
        <div className="sim-bottombar">
            <div className="sim-bottombar__left">
                <BarIcon label="OVERVIEW" symbol="⊙" onClick={onOpenOverview} />
                <BarIcon label="BOARD" symbol="⊞" onClick={onOpenBoard} />
            </div>

            <div className="sim-bottombar__centre">
                <div className="sim-bottombar__phase-track">
                    {Array.from({ length: totalPhases }).map((_, i) => (
                        <div
                            key={i}
                            className={`sim-phase-pip${i < phaseIndex ? " sim-phase-pip--done" : i === phaseIndex ? " sim-phase-pip--active" : ""}`}
                        />
                    ))}
                </div>
                <div className="sim-bottombar__phase-label">
                    <span className="sim-bottombar__phase-slash"> </span>
                    PHASE {phaseIndex + 1} — {phase?.title?.toUpperCase()}
                </div>
                {gatesTotal > 0 && (
                    <div className={`sim-bottombar__gates${gatesDone === gatesTotal ? " sim-bottombar__gates--clear" : ""}`}>
                        {gatesDone}/{gatesTotal} GATES
                    </div>
                )}
            </div>

            <div className={`sim-bottombar__timer${timerCritical ? " sim-bottombar__timer--critical" : ""}${isTimerFrozen ? " sim-bottombar__timer--frozen" : ""}`}>
                {isTimerFrozen && <span className="sim-bottombar__timer-frozen-label">LOCKED</span>}
                <span className="sim-bottombar__timer-digits">{formatTime(timeLeft)}</span>
            </div>
        </div>
    );
}

function BarIcon({ label, symbol, onClick }) {
    return (
        <button className="sim-bar-icon" onClick={onClick} title={label}>
            <span className="sim-bar-icon__symbol">{symbol}</span>
            <span className="sim-bar-icon__label">{label}</span>
        </button>
    );
}

// ─── Overview Modal ───────────────────────────────────────────────────────────
function OverviewModal({ scenario, phase, phaseIndex, totalPhases, onClose }) {
    return (
        <div className="sim-modal-backdrop" onClick={onClose}>
            <div className="sim-modal sim-modal--overview" onClick={e => e.stopPropagation()}>
                <div className="sim-modal__header">
                    <span className="sim-modal__prompt">&gt; MISSION BRIEFING</span>
                    <button className="sim-modal__close" onClick={onClose}>[X]</button>
                </div>
                <div className="sim-modal__body">
                    <div className="sim-overview__title">{scenario.title}</div>
                    <div className="sim-overview__meta">
                        <span className="sim-overview__tag" style={{ color: "#e63946" }}>
                            {scenario.difficulty?.toUpperCase()}
                        </span>
                        <span className="sim-overview__tag">{scenario.estimated_time_minutes}MIN</span>
                        <span className="sim-overview__tag">PHASE {phaseIndex + 1}/{totalPhases}</span>
                    </div>
                    <div className="sim-overview__divider" />
                    <p className="sim-overview__desc">{scenario.description}</p>
                    <div className="sim-overview__divider" />
                    <div className="sim-overview__phase-label">
                        &gt; CURRENT PHASE: {phase?.title?.toUpperCase()}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Questions Modal ──────────────────────────────────────────────────────────
// onSubmit receives the raw answers map { [questionId]: answerString }.
// The parent component handles the actual API call so this component stays
// focused purely on the UI — collecting input and validating completeness.
// submitting prop controls a loading state while the POST is in flight.
function QuestionsModal({ questions, phaseName, isEndOfScenario, onSubmit, submitting }) {
    const [answers, setAnswers] = useState(
        Object.fromEntries(questions.map(q => [q.id, ""]))
    );

    const allAnswered = questions.every(q => answers[q.id]?.trim());

    return (
        <div className="sim-modal-backdrop">
            <div className="sim-modal sim-modal--questions">
                <div className="sim-modal__header">
                    <span className="sim-modal__prompt">
                        {isEndOfScenario
                            ? "> DEBRIEF PROTOCOL — END OF SCENARIO"
                            : `> PHASE DEBRIEF — ${phaseName?.toUpperCase()}`}
                    </span>
                </div>
                <div className="sim-modal__body">
                    <p className="sim-questions__intro">
                        {isEndOfScenario
                            ? "Answer the following questions to complete the scenario."
                            : "Answer the following questions to proceed to the next phase."}
                    </p>
                    <div className="sim-questions__list">
                        {questions.map((q, i) => (
                            <div key={q.id} className="sim-question">
                                <div className="sim-question__label">
                                    <span className="sim-question__num">
                                        [{String(i + 1).padStart(2, "0")}]
                                    </span>
                                    {q.question_text}
                                </div>
                                <textarea
                                    className="sim-question__input"
                                    value={answers[q.id]}
                                    onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                                    placeholder="> enter response..."
                                    rows={3}
                                    disabled={submitting}
                                />
                            </div>
                        ))}
                    </div>
                    <button
                        className={`sim-proceed-btn${allAnswered && !submitting ? " sim-proceed-btn--ready" : ""}`}
                        disabled={!allAnswered || submitting}
                        onClick={() => onSubmit(answers)}
                    >
                        {submitting
                            ? "[ TRANSMITTING... ]"
                            : isEndOfScenario
                                ? "[ SUBMIT DEBRIEF ]"
                                : "[ PROCEED TO NEXT PHASE ]"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Phase Transition Overlay ─────────────────────────────────────────────────
function PhaseTransitionOverlay({ phase, phaseIndex, onDone }) {
    useEffect(() => {
        const t = setTimeout(onDone, 3000);
        return () => clearTimeout(t);
    }, [onDone]);

    return (
        <div className="sim-transition">
            <div className="sim-transition__glitch" data-text="// PHASE UNLOCKED">PHASE UNLOCKED</div>
            <div className="sim-transition__phase">{phase?.title?.toUpperCase()}</div>
            <div className="sim-transition__num">PHASE {phaseIndex + 1}</div>
            <div className="sim-transition__scanlines" />
        </div>
    );
}

// EvidenceLocker replaced by InvestigationBoard — see InvestigationBoard/

// Notebook removed — freehand drawing replaced by Investigation Board

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SimulatorPage() {
    const { scenarioId } = useParams();
    const navigate       = useNavigate();
    const token          = getToken();

    // ── Source data from API ───────────────────────────────────────────────────
    const [loadingData,  setLoadingData]  = useState(true);
    const [fetchError,   setFetchError]   = useState(null);
    const [scenarioData, setScenarioData] = useState(null);
    const [allPhases,    setAllPhases]    = useState([]);
    const [allInjects,   setAllInjects]   = useState([]);
    const [allQuestions, setAllQuestions] = useState([]);

    // ── Attempt tracking ───────────────────────────────────────────────────────
    // attemptId is stored in state so it can be passed to the submissions POST
    // and the complete PATCH. It's set after the attempt is created on mount.
    const [attemptId, setAttemptId] = useState(null);

    // submitting controls the loading state on the questions modal button
    // while the answers POST is in flight — prevents double-submission.
    const [submitting, setSubmitting] = useState(false);

    // ── Runtime state ──────────────────────────────────────────────────────────
    const [phaseIndex,        setPhaseIndex]        = useState(0);
    const [allObjectives,     setAllObjectives]     = useState([]);
    const [objResponses,      setObjResponses]      = useState({}); // { [objectiveId]: response }
    const [receivedInjects,   setReceivedInjects]   = useState([]);
    const [newInjectId,       setNewInjectId]       = useState(null);
    const [timeLeft,          setTimeLeft]          = useState(0);
    const [elapsed,           setElapsed]           = useState(0);
    const [phaseElapsed,      setPhaseElapsed]      = useState(0);
    const [releaseSchedule,   setReleaseSchedule]   = useState({});
    const [objCollapsed,      setObjCollapsed]      = useState(false);
    const [overlay,           setOverlay]           = useState(null);
    const [nextPhaseIdx,      setNextPhaseIdx]      = useState(null);
    const feedRef        = useRef(null);
    // Guards against StrictMode double-invocation — ensures VM starts exactly once
    const vmStartedRef   = useRef(false);
    // Track released inject IDs in a ref so the release-check effect doesn't
    // need receivedInjects in its dependency array, preventing the race condition
    // where an inject fires multiple times before alreadyReleased catches it.
    const releasedIdsRef = useRef(new Set());

    // ── Derived values ─────────────────────────────────────────────────────────
    const currentPhase   = allPhases[phaseIndex];
    const phaseQuestions = currentPhase ? allQuestions.filter(q => q.phase_id === currentPhase.id) : [];
    const endQuestions   = allQuestions.filter(q => q.question_type === "end_of_scenario");
    // Objectives are scenario-wide — no phase filtering, no blocking
    const blockingLeft   = 0;
    const gatesTotal     = 0;
    const gatesDone      = 0;
    const isTimerFrozen  = false;

    // ── Fetch scenario data and create attempt on mount ────────────────────────
    // These two API calls happen sequentially inside a single useEffect so the
    // component only transitions out of the loading state once both are done.
    //
    // WHY create the attempt here rather than on the Scenarios page?
    // Because the student might navigate directly to this URL, or refresh the
    // page mid-scenario. Creating the attempt here, with a resume-if-active check
    // on the backend, handles all those cases cleanly.
    useEffect(() => {
        async function load() {
            try {
                // ── 1. Load all scenario data ──────────────────────────────────
                const res = await fetch(
                    API(`/scenarios/${scenarioId}/full`),
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!res.ok) throw new Error(`Failed to load scenario (${res.status})`);
                const data = await res.json();

                setScenarioData(data.scenario);
                setAllPhases(data.phases);
                setAllInjects(data.injects);
                setAllQuestions(data.questions);
                setAllObjectives(data.objectives);

                if (data.phases.length > 0) {
                    setTimeLeft(data.phases[0].duration_minutes * 60);
                }

                // ── 2. Create (or resume) an attempt record ────────────────────
                // POST /api/attempts returns { attempt_id, resumed }.
                // resumed: true means a previous active attempt was found and
                // returned instead of creating a duplicate — handles page refresh.
                const attemptRes = await fetch(
                    API(`/attempts`),
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ scenario_id: scenarioId }),
                    }
                );
                if (!attemptRes.ok) throw new Error("Failed to create attempt");
                const { attempt_id } = await attemptRes.json();
                setAttemptId(attempt_id);


            } catch (err) {
                console.error("SimulatorPage load error:", err);
                setFetchError(err.message);
            } finally {
                setLoadingData(false);
            }
        }
        load();
    }, [scenarioId, token]);

    // ── Start VM once when attemptId is first set ─────────────────────────────
    // Separate from the load() effect so StrictMode double-invoke does not
    // cause a race. vmStartedRef ensures this fires exactly once per session.
    useEffect(() => {
        if (!attemptId || vmStartedRef.current) return;
        vmStartedRef.current = true;

        async function startVM() {
            try {
                const statusRes = await fetch(
                    API(`/vm/status/${attemptId}`),
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const statusData = await statusRes.json();

                if (statusData.running) {
                    window.open(statusData.url, "ForensicWorkstation");
                    return;
                }

                const vmRes = await fetch(
                    API(`/vm/start`),
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ attempt_id: attemptId }),
                    }
                );
                if (vmRes.ok) {
                    const vmData = await vmRes.json();
                    window.open(vmData.url, "ForensicWorkstation");
                }
            } catch (vmErr) {
                console.warn("VM start failed:", vmErr.message);
            }
        }

        startVM();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attemptId]);

    // ── Build inject release schedule when phase changes ───────────────────────
    // Scenario-wide injects (phase_id === null) are only scheduled on phase 0.
    // When the phase changes we reset the released-IDs ref but keep scenario-wide
    // inject IDs in it so they don't fire again on later phases.
    useEffect(() => {
        if (!currentPhase) return;

        console.log('[Schedule] rebuilding for phase:', currentPhase.id);

        setPhaseElapsed(0);

        // Keep scenario-wide inject IDs so they don't re-fire on phase change
        const scenarioWideIds = new Set(
            allInjects.filter(inj => inj.phase_id === null).map(inj => inj.id)
        );

        // Preserve already-released scenario-wide IDs, clear phase-specific ones
        const preserved = new Set(
            [...releasedIdsRef.current].filter(id => scenarioWideIds.has(id))
        );

        releasedIdsRef.current = preserved;

        const phaseInjects = allInjects.filter(inj => {
            if (inj.phase_id === currentPhase.id) return true;
            if (inj.phase_id === null && phaseIndex === 0) return true;
            return false;
        });

        const schedule = {};
            phaseInjects.forEach(inj => {
                let releaseAt;

                if (
                    inj.release_type === "guaranteed_in_phase" ||
                    inj.release_type === "guaranteed_in_scenario"
                ) {
                    releaseAt = (inj.guaranteed_release_minutes || 0) * 60;
                } else {
                    const minSec = (inj.min_delay_minutes || 0) * 60;
                    const maxSec = (inj.max_delay_minutes || 1) * 60;
                    releaseAt = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
                }

                schedule[inj.id] = releaseAt;
            });

            setReleaseSchedule(schedule);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phaseIndex, allInjects]);

    // ── Timer tick via ref (avoids stale closures) ─────────────────────────────
    const timerStateRef = useRef({});
    timerStateRef.current = {
        requiresCompletion: currentPhase?.requires_completion,
        blockingLeft,
    };

    useEffect(() => {
        const interval = setInterval(() => {
            const { requiresCompletion, blockingLeft } = timerStateRef.current;
            setTimeLeft(t => {
                if (t <= 0) return 0;
                if (requiresCompletion && blockingLeft > 0) return t;
                return t - 1;
            });
            setElapsed(e => e + 1);
            setPhaseElapsed(e => e + 1);
        }, 1000);
        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Check inject releases each second ─────────────────────────────────────
    // Uses releasedIdsRef instead of receivedInjects to avoid the race condition
    // where the effect re-runs on every state update and fires duplicates.
    useEffect(() => {
        if (!currentPhase) {
            console.log('[Inject effect] no currentPhase');
            return;
        }

        if (!attemptId) {
            console.log('[Inject effect] waiting for attemptId...');
            return;
        }

        const phaseInjects = allInjects.filter(
            inj => inj.phase_id === currentPhase.id || inj.phase_id === null
        );

        phaseInjects.forEach(inj => {
            const releaseAt = releaseSchedule[inj.id];

            if (releaseAt === undefined) {
                console.log('[Inject skipped] no release schedule', inj.id);
                return;
            }

            //console.log('[Inject check]', {
            //    injId: inj.id,
            //    phaseElapsed,
            //    releaseAt,
            //    alreadyReleased: releasedIdsRef.current.has(inj.id)
            //});

            if (!releasedIdsRef.current.has(inj.id) && phaseElapsed >= releaseAt) {
                console.log('[Inject TRIGGERED]', inj.id);

                releasedIdsRef.current.add(inj.id);

                // file_name may be null in DB — fall back to extracting from file_path
                const injectFileName = inj.file_name || inj.file_path?.split('/').pop();
                if (inj.file_path && injectFileName) {
                    console.log('[Inject FETCH] sending', {
                        attemptId,
                        file_path: inj.file_path,
                        file_name: inj.file_name
                    });

                    fetch(API(`/vm/inject/${attemptId}`), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            file_path: inj.file_path,
                            file_name: injectFileName
                        })
                    })
                    .then(res => res.json())
                    .then(data => console.log('[Inject SUCCESS]', data))
                    .catch(err => console.warn('[Inject ERROR]', err));
                } else {
                    console.log('[Inject skipped] missing file data', inj);
                }

                const stamped = { ...inj, receivedAt: formatTimestamp() };
                setReceivedInjects(prev => [stamped, ...prev]);

                setNewInjectId(inj.id);
                setTimeout(() => setNewInjectId(null), 2000);
            }
        });

    }, [phaseElapsed, currentPhase, releaseSchedule, allInjects, token, attemptId]);

    // ── End phase when timer hits 0 ────────────────────────────────────────────
    // Triggers when:
    //   - timer hits 0 and phase doesn't require completion, OR
    //   - timer hits 0 and phase requires completion but all blocking objectives are done
    useEffect(() => {
        if (timeLeft === 0 && currentPhase) {
            if (!currentPhase.requires_completion || blockingLeft === 0) {
                handlePhaseEnd();
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeLeft, blockingLeft]);

    // ── Submit a side objective answer ────────────────────────────────────────
    const handleSubmitObjective = useCallback(async (objectiveId, answer) => {
        if (!attemptId) return;
        try {
            const res = await fetch(
                API(`/scenarios/responses`),
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ attempt_id: attemptId, objective_id: objectiveId, answer }),
                }
            );
            if (!res.ok) throw new Error("Failed to submit objective");
            const data = await res.json();
            setObjResponses(prev => ({
                ...prev,
                [objectiveId]: {
                    answer,
                    is_correct:    data.is_correct,
                    score:         data.score,
                    attempts_used: data.attempts_used,
                    is_locked:     data.is_locked,
                },
            }));
        } catch (err) {
            console.error("Objective submission error:", err);
        }
    }, [attemptId, token]);

    // ── Auto-submit unlocked side objectives at scenario end ───────────────────
    const autoSubmitObjectives = useCallback(async () => {
        const sideObjs = allObjectives.filter(o => o.objective_type === "side");
        for (const obj of sideObjs) {
            const resp = objResponses[obj.id];
            // Only auto-submit if there's a draft answer and not already locked
            if (resp && resp.answer && !resp.is_locked) {
                await handleSubmitObjective(obj.id, resp.answer);
            }
        }
    }, [allObjectives, objResponses, handleSubmitObjective]);

    // ── Submit answers for a phase or end-of-scenario ──────────────────────────
    // Called by QuestionsModal's onSubmit with the answers map.
    // Converts the { [questionId]: answer } map into the array format the
    // backend expects, then POSTs to /api/submissions.
    //
    // The submitting flag disables the button and shows a loading label while
    // the request is in flight, preventing double-submission.
    //
    // After a successful submission:
    //   - Phase questions → advance to transition overlay
    //   - End-of-scenario questions → advance to complete screen and mark done
    const handleSubmitAnswers = useCallback(async (answers, isEndOfScenario) => {
        setSubmitting(true);
        try {
            // Submit each question answer as a separate response
            await Promise.all(
                Object.entries(answers).map(([question_id, answer]) =>
                    fetch(API(`/scenarios/responses`), {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ attempt_id: attemptId, question_id, answer }),
                    })
                )
            );
        } catch (err) {
            console.error("Answer submission error:", err);
        } finally {
            setSubmitting(false);
        }

        const isFinalPhase = phaseIndex === allPhases.length - 1;

        if (isEndOfScenario) {
            // Auto-submit any unlocked side objective answers, then complete
            await autoSubmitObjectives();
            if (attemptId) {
                fetch(API(`/attempts/${attemptId}/complete`), {
                    method: "PATCH",
                    headers: { Authorization: `Bearer ${token}` },
                }).catch(err => console.error("Failed to complete attempt:", err));
            }
            setOverlay("complete");
        } else if (isFinalPhase) {
            if (endQuestions.length > 0) {
                setOverlay("questions-end");
            } else {
                await autoSubmitObjectives();
                setOverlay("complete");
            }
        } else {
            setOverlay("transition");
        }
    }, [token, attemptId, phaseIndex, allPhases.length, endQuestions.length, autoSubmitObjectives]);

    // ── Determine what to show at phase end ────────────────────────────────────
    const handlePhaseEnd = useCallback(() => {
        
        const nextIdx = phaseIndex + 1;

        if (nextIdx >= allPhases.length) {
            if (phaseQuestions.length > 0) {
                setOverlay("questions"); 
            } else if (endQuestions.length > 0) {
                setOverlay("questions-end");
            } else {
                if (attemptId) {
                    fetch(API(`/attempts/${attemptId}/complete`), {
                        method: "PATCH",
                        headers: { Authorization: `Bearer ${token}` },
                    }).catch(err => console.error("Failed to complete attempt:", err));
                }
                setOverlay("complete");
            }
            return;
        }

        setNextPhaseIdx(nextIdx);
        if (phaseQuestions.length > 0) {
            setOverlay("questions");
        } else {
            setOverlay("transition");
        }
    }, [phaseIndex, allPhases.length, phaseQuestions.length, attemptId, token, endQuestions.length]);

    // ── Advance to next phase ──────────────────────────────────────────────────
    const advancePhase = useCallback(() => {
        const idx = nextPhaseIdx ?? phaseIndex + 1;
        setPhaseIndex(idx);
        setTimeLeft(allPhases[idx].duration_minutes * 60);
        setOverlay(null);
        setNextPhaseIdx(null);
    }, [nextPhaseIdx, phaseIndex, allPhases]);

    // ── P key shortcut (demo only) ─────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "p" || e.key === "P") handlePhaseEnd();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [handlePhaseEnd]);

    // ── Exit handler ───────────────────────────────────────────────────────────
    // Navigate back to scenarios rather than closing the tab —
    // window.close() only works if the tab was opened by JavaScript.
    const handleExit = useCallback(() => {
        navigate("/scenarios");
    }, [navigate]);

    // ── Loading / error guards ─────────────────────────────────────────────────
    if (loadingData) {
        return (
            <div className="sim-page">
                <div className="sim-scanlines" />
                <div className="sim-loading">
                    &gt; LOADING SCENARIO DATA<span className="sim-feed__blink">_</span>
                </div>
            </div>
        );
    }

    if (fetchError || !scenarioData) {
        return (
            <div className="sim-page">
                <div className="sim-scanlines" />
                <div className="sim-loading sim-loading--error">
                    &gt; ERROR: {fetchError || "SCENARIO NOT FOUND"}
                </div>
            </div>
        );
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="sim-page">
            <div className="sim-scanlines" />
            <div className="sim-vignette" />

            <div className="sim-body">
                <VMPanel attemptId={attemptId} />
                <div className="sim-feed" ref={feedRef}>
                    <div className="sim-feed__header">
                        <span className="sim-feed__title">
                            &gt; TRANSMISSION_FEED
                            <span className="sim-feed__blink">_</span>
                        </span>
                        <span className="sim-feed__count">
                            {receivedInjects.length} ITEM{receivedInjects.length !== 1 ? "S" : ""} RECEIVED
                        </span>
                    </div>

                    <div className="sim-feed__list">
                        {receivedInjects.length === 0 ? (
                            <div className="sim-feed__empty">
                                <div className="sim-feed__empty-icon">◈</div>
                                <div>AWAITING INCOMING DATA</div>
                                <div className="sim-feed__empty-sub">transmissions will appear here</div>
                            </div>
                        ) : (
                            receivedInjects.map(inj => (
                                <InjectCard
                                    key={inj.id}
                                    inject={inj}
                                    isNew={inj.id === newInjectId}
                                />
                            ))
                        )}
                    </div>
                </div>

                <ObjectivesPanel
                    objectives={allObjectives}
                    responses={objResponses}
                    onSubmitObjective={handleSubmitObjective}
                    collapsed={objCollapsed}
                    onCollapse={() => setObjCollapsed(v => !v)}
                />
            </div>

            <BottomBar
                phase={currentPhase}
                phaseIndex={phaseIndex}
                totalPhases={allPhases.length}
                timeLeft={timeLeft}
                isTimerFrozen={isTimerFrozen}
                gatesTotal={gatesTotal}
                gatesDone={gatesDone}
                onOpenOverview={() => setOverlay("overview")}
                onOpenBoard={() => setOverlay("board")}
            />

            {overlay === "overview" && (
                <OverviewModal
                    scenario={scenarioData}
                    phase={currentPhase}
                    phaseIndex={phaseIndex}
                    totalPhases={allPhases.length}
                    onClose={() => setOverlay(null)}
                />
            )}


            {overlay === "board" && (
                <InvestigationBoard
                    receivedInjects={receivedInjects}
                    attemptId={attemptId}
                    onClose={() => setOverlay(null)}
                />
            )}

            {(overlay === "questions" || overlay === "questions-end") && (
                <QuestionsModal
                    questions={overlay === "questions-end" ? endQuestions : phaseQuestions}
                    phaseName={currentPhase?.title}
                    isEndOfScenario={overlay === "questions-end"}
                    submitting={submitting}
                    onSubmit={(answers) =>
                        handleSubmitAnswers(answers, overlay === "questions-end")
                    }
                />
            )}

            {overlay === "transition" && (
                <PhaseTransitionOverlay
                    phase={allPhases[nextPhaseIdx ?? phaseIndex + 1]}
                    phaseIndex={nextPhaseIdx ?? phaseIndex + 1}
                    onDone={advancePhase}
                />
            )}

            {overlay === "complete" && (
                <div className="sim-complete">
                    <div className="sim-complete__glitch" data-text="// SCENARIO COMPLETE">
                        SCENARIO COMPLETE
                    </div>
                    <div className="sim-complete__sub">
                        OPERATION: {scenarioData.title.toUpperCase()}
                    </div>
                    <div className="sim-complete__divider" />
                    <p className="sim-complete__msg">All phases completed. Debrief data recorded.</p>
                    <button
                        className="sim-proceed-btn sim-proceed-btn--ready"
                        onClick={handleExit}
                    >
                        [ EXIT SIMULATION ]
                    </button>
                </div>
            )}

            <div className="sim-demo-hint">PRESS P TO ADVANCE PHASE</div>
        </div>
    );
}