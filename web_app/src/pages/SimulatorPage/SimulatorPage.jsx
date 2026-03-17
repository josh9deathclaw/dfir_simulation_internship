import React, { useState, useEffect, useRef, useCallback } from "react";
import "./SimulatorPage.css";
import { useParams, useNavigate } from "react-router-dom";
import { getToken } from "../../utils/auth";

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

    const handleRetrieve = () => {
        if (inject.file_path) {
            window.open(`${process.env.REACT_APP_API_URL}/${inject.file_path}`, "_blank");
        }
    };

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
                        <button className="sim-inject__dl" onClick={handleRetrieve}>
                            [ RETRIEVE ]
                        </button>
                    </div>
                )}
            </div>
            <div className="sim-inject__border-flash" style={{ "--flash-color": color }} />
        </div>
    );
}

// ─── Objectives Panel ─────────────────────────────────────────────────────────
function ObjectivesPanel({ phase, objectives, onToggle, collapsed, onCollapse }) {
    if (!phase) return null;

    const main     = objectives.filter(o => o.objective_type === "main");
    const side     = objectives.filter(o => o.objective_type === "side");
    const blocking = objectives.filter(o => o.blocks_progression && !o.completed).length;
    const total    = objectives.filter(o => o.blocks_progression).length;

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
                        <div className="sim-objectives__empty">NO OBJECTIVES THIS PHASE</div>
                    )}

                    {blocking > 0 && (
                        <div className="sim-objectives__gate-warn">
                            <span className="sim-objectives__gate-icon">⚠</span>
                            {total - blocking}/{total} gates cleared
                        </div>
                    )}

                    {main.length > 0 && (
                        <div className="sim-objectives__group">
                            <div className="sim-objectives__group-label sim-objectives__group-label--main">
                                PRIMARY
                            </div>
                            {main.map(obj => (
                                <ObjectiveRow key={obj.id} obj={obj} onToggle={onToggle} />
                            ))}
                        </div>
                    )}

                    {side.length > 0 && (
                        <div className="sim-objectives__group">
                            <div className="sim-objectives__group-label sim-objectives__group-label--side">
                                SECONDARY
                            </div>
                            {side.map(obj => (
                                <ObjectiveRow key={obj.id} obj={obj} onToggle={onToggle} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ObjectiveRow({ obj, onToggle }) {
    const isMain = obj.objective_type === "main";
    return (
        <div
            className={`sim-obj-row${obj.completed ? " sim-obj-row--done" : ""}${obj.blocks_progression && !obj.completed ? " sim-obj-row--blocking" : ""}`}
            onClick={() => onToggle(obj.id)}
        >
            <span className={`sim-obj-row__bullet${isMain ? " sim-obj-row__bullet--main" : " sim-obj-row__bullet--side"}`}>
                {obj.completed ? "◆" : isMain ? "◇" : "◈"}
            </span>
            <span className="sim-obj-row__text">{obj.description}</span>
            {obj.blocks_progression && !obj.completed && (
                <span className="sim-obj-row__lock" title="Required for phase progression">⬡</span>
            )}
        </div>
    );
}

// ─── Bottom Bar ───────────────────────────────────────────────────────────────
function BottomBar({
    phase, phaseIndex, totalPhases, timeLeft,
    isTimerFrozen, gatesTotal, gatesDone,
    onOpenOverview, onOpenNotebook, onOpenEvidence,
}) {
    const timerCritical = timeLeft < 120 && !isTimerFrozen;

    return (
        <div className="sim-bottombar">
            <div className="sim-bottombar__left">
                <BarIcon label="OVERVIEW" symbol="⊙" onClick={onOpenOverview} />
                <BarIcon label="NOTEBOOK" symbol="✎" onClick={onOpenNotebook} />
                <BarIcon label="EVIDENCE" symbol="⊞" onClick={onOpenEvidence} />
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
                    <span className="sim-bottombar__phase-slash">// </span>
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
            <div className="sim-transition__glitch" data-text="// PHASE UNLOCKED">// PHASE UNLOCKED</div>
            <div className="sim-transition__phase">{phase?.title?.toUpperCase()}</div>
            <div className="sim-transition__num">PHASE {phaseIndex + 1}</div>
            <div className="sim-transition__scanlines" />
        </div>
    );
}

// ─── Evidence Locker ──────────────────────────────────────────────────────────
function EvidenceLocker({ injects, onClose }) {
    const [selected,    setSelected]    = useState(null);
    const [annotations, setAnnotations] = useState({});

    return (
        <div className="sim-modal-backdrop" onClick={onClose}>
            <div className="sim-drawer" onClick={e => e.stopPropagation()}>
                <div className="sim-drawer__header">
                    <span className="sim-modal__prompt">&gt; EVIDENCE LOCKER</span>
                    <button className="sim-modal__close" onClick={onClose}>[X]</button>
                </div>
                <div className="sim-drawer__body">
                    {injects.length === 0 ? (
                        <div className="sim-drawer__empty">NO EVIDENCE RECEIVED YET</div>
                    ) : (
                        <div className="sim-drawer__list">
                            {injects.map(inj => {
                                const color = getFileTypeColor(inj.file_type);
                                return (
                                    <div
                                        key={inj.id}
                                        className={`sim-evidence-row${selected?.id === inj.id ? " sim-evidence-row--active" : ""}`}
                                        onClick={() => setSelected(selected?.id === inj.id ? null : inj)}
                                    >
                                        <span className="sim-evidence-row__badge" style={{ color, borderColor: color }}>
                                            {inj.file_type || "FILE"}
                                        </span>
                                        <span className="sim-evidence-row__name">{inj.title}</span>
                                        <span className="sim-evidence-row__time">{inj.receivedAt}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {selected && (
                        <div className="sim-annotation">
                            <div className="sim-annotation__title">&gt; {selected.title}</div>
                            <div className="sim-annotation__desc">{selected.description}</div>
                            <textarea
                                className="sim-annotation__input"
                                placeholder="> add analyst notes..."
                                value={annotations[selected.id] || ""}
                                onChange={e => setAnnotations(a => ({ ...a, [selected.id]: e.target.value }))}
                                rows={4}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Notebook ─────────────────────────────────────────────────────────────────
function Notebook({ onClose }) {
    const canvasRef             = useRef(null);
    const [tool, setTool]       = useState("pen");
    const [drawing, setDrawing] = useState(false);
    const lastPos               = useRef(null);

    const getPos = (e, canvas) => {
        const rect   = canvas.getBoundingClientRect();
        const scaleX = canvas.width  / rect.width;
        const scaleY = canvas.height / rect.height;
        const src    = e.touches ? e.touches[0] : e;
        return {
            x: (src.clientX - rect.left) * scaleX,
            y: (src.clientY - rect.top)  * scaleY,
        };
    };

    const startDraw = (e) => {
        if (!canvasRef.current) return;
        setDrawing(true);
        lastPos.current = getPos(e, canvasRef.current);
    };

    const draw = (e) => {
        if (!drawing || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext("2d");
        const pos = getPos(e, canvasRef.current);
        ctx.strokeStyle = tool === "eraser" ? "#030710" : "#4cc9f0";
        ctx.lineWidth   = tool === "eraser" ? 24 : 2;
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";
        ctx.beginPath();
        ctx.moveTo(lastPos.current.x, lastPos.current.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        lastPos.current = pos;
    };

    const stopDraw = () => setDrawing(false);

    const clearCanvas = () => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext("2d");
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    };

    return (
        <div className="sim-modal-backdrop" onClick={onClose}>
            <div className="sim-notebook" onClick={e => e.stopPropagation()}>
                <div className="sim-notebook__header">
                    <span className="sim-modal__prompt">&gt; ANALYST NOTEBOOK</span>
                    <div className="sim-notebook__tools">
                        <button className={`sim-nb-tool${tool === "pen" ? " sim-nb-tool--active" : ""}`} onClick={() => setTool("pen")}>✎ PEN</button>
                        <button className={`sim-nb-tool${tool === "eraser" ? " sim-nb-tool--active" : ""}`} onClick={() => setTool("eraser")}>⌫ ERASE</button>
                        <button className="sim-nb-tool sim-nb-tool--clear" onClick={clearCanvas}>⊘ CLEAR</button>
                    </div>
                    <button className="sim-modal__close" onClick={onClose}>[X]</button>
                </div>
                <div className="sim-notebook__body">
                    <canvas
                        ref={canvasRef}
                        className="sim-notebook__canvas"
                        width={1400}
                        height={760}
                        onMouseDown={startDraw}
                        onMouseMove={draw}
                        onMouseUp={stopDraw}
                        onMouseLeave={stopDraw}
                    />
                    <div className="sim-notebook__grid" />
                </div>
                <div className="sim-notebook__footer">
                    SESSION DATA NOT SAVED — CLOSES ON SCENARIO END
                </div>
            </div>
        </div>
    );
}

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
    const [phaseIndex,      setPhaseIndex]      = useState(0);
    const [objectives,      setObjectives]      = useState([]);
    const [receivedInjects, setReceivedInjects] = useState([]);
    const [newInjectId,     setNewInjectId]     = useState(null);
    const [timeLeft,        setTimeLeft]        = useState(0);
    const [elapsed,         setElapsed]         = useState(0);
    const [phaseElapsed,    setPhaseElapsed]    = useState(0);
    const [releaseSchedule, setReleaseSchedule] = useState({});
    const [objCollapsed,    setObjCollapsed]    = useState(false);
    const [overlay,         setOverlay]         = useState(null);
    const [nextPhaseIdx,    setNextPhaseIdx]    = useState(null);
    const feedRef = useRef(null);

    // ── Derived values ─────────────────────────────────────────────────────────
    const currentPhase   = allPhases[phaseIndex];
    const phaseObjs      = currentPhase ? objectives.filter(o => o.phase_id === currentPhase.id) : [];
    const phaseQuestions = currentPhase ? allQuestions.filter(q => q.phase_id === currentPhase.id) : [];
    const blockingLeft   = phaseObjs.filter(o => o.blocks_progression && !o.completed).length;
    const gatesTotal     = phaseObjs.filter(o => o.blocks_progression).length;
    const gatesDone      = gatesTotal - blockingLeft;
    const isTimerFrozen  = !!(currentPhase?.requires_completion && blockingLeft > 0 && timeLeft === 0);

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
                    `${process.env.REACT_APP_API_URL}/api/scenarios/${scenarioId}/full`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!res.ok) throw new Error(`Failed to load scenario (${res.status})`);
                const data = await res.json();

                setScenarioData(data.scenario);
                setAllPhases(data.phases);
                setAllInjects(data.injects);
                setAllQuestions(data.questions);
                setObjectives(data.objectives.map(o => ({ ...o, completed: false })));

                if (data.phases.length > 0) {
                    setTimeLeft(data.phases[0].duration_minutes * 60);
                }

                // ── 2. Create (or resume) an attempt record ────────────────────
                // POST /api/attempts returns { attempt_id, resumed }.
                // resumed: true means a previous active attempt was found and
                // returned instead of creating a duplicate — handles page refresh.
                const attemptRes = await fetch(
                    `${process.env.REACT_APP_API_URL}/api/attempts`,
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

    // ── Build inject release schedule when phase changes ───────────────────────
    useEffect(() => {
        if (!currentPhase) return;
        setPhaseElapsed(0);

        const phaseInjects = allInjects.filter(
            inj => inj.phase_id === currentPhase.id || inj.phase_id === null
        );

        const schedule = {};
        phaseInjects.forEach(inj => {
            if (
                inj.release_type === "guaranteed_in_phase" ||
                inj.release_type === "guaranteed_in_scenario"
            ) {
                schedule[inj.id] = (inj.guaranteed_release_minutes || 0) * 60;
            } else {
                const minSec = (inj.min_delay_minutes || 0) * 60;
                const maxSec = (inj.max_delay_minutes || 1) * 60;
                schedule[inj.id] = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
            }
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
    useEffect(() => {
        if (!currentPhase) return;
        const phaseInjects = allInjects.filter(
            inj => inj.phase_id === currentPhase.id || inj.phase_id === null
        );
        phaseInjects.forEach(inj => {
            const releaseAt = releaseSchedule[inj.id];
            if (releaseAt === undefined) return;
            const alreadyReleased = receivedInjects.some(r => r.id === inj.id);
            if (!alreadyReleased && phaseElapsed >= releaseAt) {
                const stamped = { ...inj, receivedAt: formatTimestamp() };
                setReceivedInjects(prev => [stamped, ...prev]);
                setNewInjectId(inj.id);
                setTimeout(() => setNewInjectId(null), 2000);
            }
        });
    }, [phaseElapsed, currentPhase, releaseSchedule, receivedInjects, allInjects]);

    // ── End phase when timer hits 0 ────────────────────────────────────────────
    useEffect(() => {
        if (timeLeft === 0 && currentPhase && !currentPhase.requires_completion) {
            handlePhaseEnd();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeLeft]);

    // ── Toggle objective completion ────────────────────────────────────────────
    const handleToggleObjective = useCallback((objId) => {
        setObjectives(prev =>
            prev.map(o => o.id === objId ? { ...o, completed: !o.completed } : o)
        );
    }, []);

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
            const res = await fetch(
                `${process.env.REACT_APP_API_URL}/api/submissions`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        attempt_id: attemptId,
                        // Convert { "q-id-1": "my answer" } to
                        // [ { question_id: "q-id-1", answer: "my answer" } ]
                        answers: Object.entries(answers).map(([question_id, answer]) => ({
                            question_id,
                            answer,
                        })),
                    }),
                }
            );
            if (!res.ok) throw new Error("Failed to submit answers");
        } catch (err) {
            // Log but don't block progression — the student answered, we just
            // couldn't save. In production you might show a warning here.
            console.error("Answer submission error:", err);
        } finally {
            setSubmitting(false);
        }

        if (isEndOfScenario) {
            // Mark the attempt as completed then show the complete screen.
            // We fire-and-forget this PATCH — not critical if it fails.
            if (attemptId) {
                fetch(`${process.env.REACT_APP_API_URL}/api/attempts/${attemptId}/complete`, {
                    method: "PATCH",
                    headers: { Authorization: `Bearer ${token}` },
                }).catch(err => console.error("Failed to complete attempt:", err));
            }
            setOverlay("complete");
        } else {
            setOverlay("transition");
        }
    }, [token, attemptId]);

    // ── Determine what to show at phase end ────────────────────────────────────
    const handlePhaseEnd = useCallback(() => {
        const nextIdx = phaseIndex + 1;

        if (nextIdx >= allPhases.length) {
            if (phaseQuestions.length > 0) {
                setOverlay("questions-end");
            } else {
                // No questions — complete immediately and mark attempt done
                if (attemptId) {
                    fetch(`${process.env.REACT_APP_API_URL}/api/attempts/${attemptId}/complete`, {
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
    }, [phaseIndex, allPhases.length, phaseQuestions.length, attemptId, token]);

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
                    phase={currentPhase}
                    objectives={phaseObjs}
                    onToggle={handleToggleObjective}
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
                onOpenNotebook={() => setOverlay("notebook")}
                onOpenEvidence={() => setOverlay("evidence")}
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

            {overlay === "notebook" && (
                <Notebook onClose={() => setOverlay(null)} />
            )}

            {overlay === "evidence" && (
                <EvidenceLocker
                    injects={receivedInjects}
                    onClose={() => setOverlay(null)}
                />
            )}

            {(overlay === "questions" || overlay === "questions-end") && (
                <QuestionsModal
                    questions={phaseQuestions}
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