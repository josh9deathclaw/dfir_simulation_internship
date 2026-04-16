// src/pages/SimulatorPage/SimulatorPage.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import "./SimulatorPage.css";
import { useParams, useNavigate } from "react-router-dom";
import { getToken } from "../../utils/auth";
import VMPanel from '../SimulatorPage/VMPanel';
import InvestigationBoard from '../../components/InvestigationBoard/InvestigationBoard';
import NarrativeEngine from "../../components/NarrativeEngine/NarrativeEngine";
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

// ─── Inject Card ───────────────────────────────────────────────────────────────
function InjectCard({ inject, isNew }) {
    const color       = getFileTypeColor(inject.file_type);
    const displayName = inject.file_name || inject.file_path?.split("/").pop() || null;
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

// ─── Objectives Panel ──────────────────────────────────────────────────────────
function ObjectivesPanel({ objectives, onSubmitObjective, responses, collapsed, onCollapse }) {
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
                    title={collapsed ? "Expand objectives" : "Collapse objectives"}>
                    {collapsed ? "◀" : "▶"}
                </button>
            </div>
            {!collapsed && (
                <div className="sim-objectives__body">
                    {objectives.length === 0 && <div className="sim-objectives__empty">NO OBJECTIVES</div>}
                    {main.length > 0 && (
                        <div className="sim-objectives__group">
                            <div className="sim-objectives__group-label sim-objectives__group-label--main">PRIMARY</div>
                            {main.map(obj => <MainObjectiveRow key={obj.id} obj={obj} />)}
                        </div>
                    )}
                    {side.length > 0 && (
                        <div className="sim-objectives__group">
                            <div className="sim-objectives__group-label sim-objectives__group-label--side">TASKS</div>
                            {side.map(obj => (
                                <SideObjectiveRow key={obj.id} obj={obj}
                                    response={responses[obj.id]}
                                    onSubmit={(answer) => onSubmitObjective(obj.id, answer)} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function MainObjectiveRow({ obj }) {
    return (
        <div className="sim-obj-row">
            <span className="sim-obj-row__bullet sim-obj-row__bullet--main">◇</span>
            <span className="sim-obj-row__text">{obj.description}</span>
        </div>
    );
}

function SideObjectiveRow({ obj, response, onSubmit }) {
    const [draft, setDraft] = useState(response?.answer || "");
    const isLocked     = response?.is_locked || false;
    const attemptsUsed = response?.attempts_used || 0;
    const attemptsMax  = obj.max_attempts || null;
    const hasCorrect   = !!obj.correct_answer;
    const isCorrect    = response?.is_correct;
    const attemptsLeft = attemptsMax ? attemptsMax - attemptsUsed : null;
    const canSubmit    = !isLocked && draft.trim() && (attemptsLeft === null || attemptsLeft > 0);
    let scoreDisplay = null;
    if (hasCorrect && response) {
        if (isCorrect)                           scoreDisplay = <span className="sim-obj-score sim-obj-score--correct">1/1 ◆</span>;
        else if (isLocked || attemptsLeft === 0) scoreDisplay = <span className="sim-obj-score sim-obj-score--wrong">0/1 ✕</span>;
    }
    return (
        <div className={`sim-obj-row sim-obj-row--side${isCorrect ? " sim-obj-row--correct" : ""}${(isLocked && !isCorrect) ? " sim-obj-row--locked" : ""}`}>
            <div className="sim-obj-row__side-header">
                <span className="sim-obj-row__bullet sim-obj-row__bullet--side">◈</span>
                <span className="sim-obj-row__text">{obj.description}</span>
                {scoreDisplay}
            </div>
            <textarea className="sim-obj-row__input" value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="> enter response..." rows={2} disabled={isLocked} />
            <div className="sim-obj-row__footer">
                {attemptsMax && (
                    <span className="sim-obj-row__attempts">
                        {isLocked ? "LOCKED" : `${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} left`}
                    </span>
                )}
                {!isLocked && (
                    <button className={`sim-obj-row__submit${canSubmit ? " sim-obj-row__submit--ready" : ""}`}
                        disabled={!canSubmit} onClick={() => onSubmit(draft)}>
                        [ SUBMIT ]
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Bottom Bar ────────────────────────────────────────────────────────────────
// narrativeScenarioTime: only passed when mode === 'narrative', undefined otherwise
function BottomBar({ phase, phaseIndex, totalPhases, timeLeft, isTimerFrozen,
    gatesTotal, gatesDone, onOpenOverview, onOpenBoard, narrativeScenarioTime }) {
    const timerCritical = timeLeft < 120 && !isTimerFrozen;
    return (
        <div className="sim-bottom">
            <div className="sim-bottom__left">
                <button className="sim-bottom__btn" onClick={onOpenOverview}>⊞ Overview</button>
                <button className="sim-bottom__btn" onClick={onOpenBoard}>◈ Board</button>
            </div>
            <div className="sim-bottom__center">
                {phase && (
                    <>
                        <span className="sim-bottom__phase-label">PHASE {phaseIndex + 1}/{totalPhases}</span>
                        <span className="sim-bottom__phase-name">{phase.title?.toUpperCase()}</span>
                    </>
                )}
            </div>
            <div className="sim-bottom__right">
                {narrativeScenarioTime !== undefined && (
                    <span className="sim-bottom__scenario-time">⏱ {narrativeScenarioTime}u</span>
                )}
                <span className={`sim-bottom__timer${timerCritical ? " sim-bottom__timer--critical" : ""}`}>
                    {isTimerFrozen ? "⏸ FROZEN" : formatTime(timeLeft)}
                </span>
            </div>
        </div>
    );
}

// ─── Overlays ─────────────────────────────────────────────────────────────────
function OverviewModal({ scenario, phase, phaseIndex, totalPhases, onClose }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <div className="sim-overlay sim-overlay--overview" onClick={onClose}>
            <div className="sim-modal" onClick={(e) => e.stopPropagation()}>
                <div className="sim-modal__header">
                    <span className="sim-modal__title">// OPERATION OVERVIEW</span>
                    <button className="sim-modal__close" onClick={onClose}>✕</button>
                </div>
                <div className="sim-modal__body">
                    <div className="sim-modal__scenario-title">{scenario.title}</div>
                    {scenario.description && <p className="sim-modal__desc">{scenario.description}</p>}
                    <div className="sim-modal__phase-info">
                        PHASE {phaseIndex + 1} / {totalPhases} — {phase?.title}
                    </div>
                    {phase?.description && <p className="sim-modal__phase-desc">{phase.description}</p>}
                </div>
            </div>
        </div>
    );
}

function QuestionsModal({ questions, phaseName, isEndOfScenario, submitting, onSubmit }) {
    const [answers, setAnswers] = useState(() =>
        Object.fromEntries(questions.map((q) => [q.id, ""]))
    );
    const allAnswered = questions.every((q) => answers[q.id]?.trim());
    return (
        <div className="sim-overlay sim-overlay--questions">
            <div className="sim-modal sim-modal--questions">
                <div className="sim-modal__header">
                    <span className="sim-modal__title">
                        {isEndOfScenario ? "// FINAL DEBRIEF" : `// PHASE DEBRIEF — ${phaseName?.toUpperCase()}`}
                    </span>
                </div>
                <div className="sim-modal__body">
                    <div className="sim-questions-list">
                        {questions.map((q, i) => (
                            <div key={q.id} className="sim-question">
                                <div className="sim-question__label">Q{i + 1}. {q.question_text}</div>
                                <textarea className="sim-question__input" value={answers[q.id]}
                                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                                    placeholder="> enter response..." rows={3} disabled={submitting} />
                            </div>
                        ))}
                    </div>
                    <button
                        className={`sim-proceed-btn${allAnswered && !submitting ? " sim-proceed-btn--ready" : ""}`}
                        disabled={!allAnswered || submitting}
                        onClick={() => onSubmit(answers)}>
                        {submitting ? "[ TRANSMITTING... ]"
                            : isEndOfScenario ? "[ SUBMIT DEBRIEF ]"
                            : "[ PROCEED TO NEXT PHASE ]"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function PhaseTransitionOverlay({ phase, phaseIndex, onDone }) {
    useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
    return (
        <div className="sim-transition">
            <div className="sim-transition__glitch" data-text="// PHASE UNLOCKED">PHASE UNLOCKED</div>
            <div className="sim-transition__phase">{phase?.title?.toUpperCase()}</div>
            <div className="sim-transition__num">PHASE {phaseIndex + 1}</div>
            <div className="sim-transition__scanlines" />
        </div>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function SimulatorPage() {
    const { scenarioId } = useParams();
    const navigate       = useNavigate();
    const token          = getToken();

    const [loadingData,  setLoadingData]  = useState(true);
    const [fetchError,   setFetchError]   = useState(null);
    const [scenarioData, setScenarioData] = useState(null);
    const [allPhases,    setAllPhases]    = useState([]);
    const [allInjects,   setAllInjects]   = useState([]);
    const [allQuestions, setAllQuestions] = useState([]);
    const [allTriggers,  setAllTriggers]  = useState([]);
    const [scenarioMode, setScenarioMode] = useState("open_ended");

    const [attemptId,       setAttemptId]       = useState(null);
    const [submitting,      setSubmitting]       = useState(false);
    const [phaseIndex,      setPhaseIndex]       = useState(0);
    const [allObjectives,   setAllObjectives]    = useState([]);
    const [objResponses,    setObjResponses]     = useState({});
    const [receivedInjects, setReceivedInjects]  = useState([]);
    const [newInjectId,     setNewInjectId]      = useState(null);
    const [timeLeft,        setTimeLeft]         = useState(0);
    const [elapsed,         setElapsed]          = useState(0);
    const [phaseElapsed,    setPhaseElapsed]     = useState(0);
    const [releaseSchedule, setReleaseSchedule]  = useState({});
    const [objCollapsed,    setObjCollapsed]     = useState(false);
    const [overlay,         setOverlay]          = useState(null);
    const [nextPhaseIdx,    setNextPhaseIdx]     = useState(null);
    // Narrative only: scenario time bubbled up from NarrativeEngine for BottomBar
    const [narrativeScenarioTime, setNarrativeScenarioTime] = useState(0);

    const feedRef        = useRef(null);
    const vmStartedRef   = useRef(false);
    const releasedIdsRef = useRef(new Set());

    const isNarrative    = scenarioMode === "narrative";
    const currentPhase   = allPhases[phaseIndex];
    const phaseQuestions = currentPhase ? allQuestions.filter(q => q.phase_id === currentPhase.id) : [];
    const endQuestions   = allQuestions.filter(q => q.question_type === "end_of_scenario");
    const blockingLeft   = 0;
    const gatesTotal     = 0;
    const gatesDone      = 0;
    const isTimerFrozen  = false;

    // ── Load data + create attempt ─────────────────────────────────────────────
    useEffect(() => {
        async function load() {
            try {
                const res = await fetch(
                    API(`/scenarios/${scenarioId}/full`),
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!res.ok) throw new Error(`Failed to load scenario (${res.status})`);
                const data = await res.json();

                setScenarioData(data.scenario);
                setScenarioMode(data.scenario.mode || "open_ended");
                setAllPhases(data.phases);
                setAllInjects(data.injects);
                setAllQuestions(data.questions);
                setAllObjectives(data.objectives || []);
                setAllTriggers(data.triggers || []);

                if (data.phases.length > 0) {
                    setTimeLeft(data.phases[0].duration_minutes * 60);
                }

                const attemptRes = await fetch(API(`/attempts`), {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ scenario_id: scenarioId }),
                });
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

    // ── VM start ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!attemptId || vmStartedRef.current) return;
        vmStartedRef.current = true;
        async function startVM() {
            try {
                const statusRes = await fetch(API(`/vm/status/${attemptId}`),
                    { headers: { Authorization: `Bearer ${token}` } });
                const statusData = await statusRes.json();
                if (statusData.running) { window.open(statusData.url, "ForensicWorkstation"); return; }
                const vmRes = await fetch(API(`/vm/start`), {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ attempt_id: attemptId }),
                });
                if (vmRes.ok) { const vmData = await vmRes.json(); window.open(vmData.url, "ForensicWorkstation"); }
            } catch (vmErr) { console.warn("VM start failed:", vmErr.message); }
        }
        startVM();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attemptId]);

    // ── Build inject release schedule (open-ended only) ────────────────────────
    useEffect(() => {
        if (isNarrative || !currentPhase) return;

        setPhaseElapsed(0);
        const scenarioWideIds = new Set(
            allInjects.filter(inj => inj.phase_id === null).map(inj => inj.id)
        );
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
            if (inj.release_type === "guaranteed_in_phase" || inj.release_type === "guaranteed_in_scenario") {
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
    }, [phaseIndex, allInjects, isNarrative]);

    // ── Timer tick ─────────────────────────────────────────────────────────────
    const timerStateRef = useRef({});
    timerStateRef.current = { requiresCompletion: currentPhase?.requires_completion, blockingLeft };

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

    // ── Open-ended: release injects on timer tick ──────────────────────────────
    useEffect(() => {
        if (isNarrative || !currentPhase || !attemptId) return;

        const phaseInjects = allInjects.filter(
            inj => inj.phase_id === currentPhase.id || inj.phase_id === null
        );

        phaseInjects.forEach(inj => {
            const releaseAt = releaseSchedule[inj.id];
            if (releaseAt === undefined) return;
            if (!releasedIdsRef.current.has(inj.id) && phaseElapsed >= releaseAt) {
                releasedIdsRef.current.add(inj.id);

                const injectFileName = inj.file_name || inj.file_path?.split('/').pop();
                if (inj.file_path && injectFileName) {
                    fetch(API(`/vm/inject/${attemptId}`), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ file_path: inj.file_path, file_name: injectFileName }),
                    }).catch(err => console.warn('[Inject ERROR]', err));
                }

                const stamped = { ...inj, receivedAt: formatTimestamp() };
                setReceivedInjects(prev => [stamped, ...prev]);
                setNewInjectId(inj.id);
                setTimeout(() => setNewInjectId(null), 2000);
            }
        });
    }, [phaseElapsed, currentPhase, releaseSchedule, allInjects, token, attemptId, isNarrative]);

    // ── Phase end ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (timeLeft === 0 && currentPhase) {
            if (!currentPhase.requires_completion || blockingLeft === 0) {
                handlePhaseEnd();
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeLeft, blockingLeft]);

    const handleSubmitObjective = useCallback(async (objectiveId, answer) => {
        if (!attemptId) return;
        try {
            const res = await fetch(API(`/scenarios/responses`), {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ attempt_id: attemptId, objective_id: objectiveId, answer }),
            });
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
        } catch (err) { console.error("Objective submission error:", err); }
    }, [attemptId, token]);

    const autoSubmitObjectives = useCallback(async () => {
        const sideObjs = allObjectives.filter(o => o.objective_type === "side");
        for (const obj of sideObjs) {
            const resp = objResponses[obj.id];
            if (resp && resp.answer && !resp.is_locked) {
                await handleSubmitObjective(obj.id, resp.answer);
            }
        }
    }, [allObjectives, objResponses, handleSubmitObjective]);

    const handleSubmitAnswers = useCallback(async (answers, isEndOfScenario) => {
        setSubmitting(true);
        try {
            await Promise.all(
                Object.entries(answers).map(([question_id, answer]) =>
                    fetch(API(`/scenarios/responses`), {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ attempt_id: attemptId, question_id, answer }),
                    })
                )
            );
        } catch (err) { console.error("Answer submission error:", err); }
        finally { setSubmitting(false); }

        const isFinalPhase = phaseIndex === allPhases.length - 1;

        if (isEndOfScenario) {
            await autoSubmitObjectives();
            if (attemptId) {
                fetch(API(`/attempts/${attemptId}/complete`), {
                    method: "PATCH", headers: { Authorization: `Bearer ${token}` },
                }).catch(err => console.error("Failed to complete attempt:", err));
            }
            setOverlay("complete");
        } else if (isFinalPhase) {
            if (endQuestions.length > 0) setOverlay("questions-end");
            else { await autoSubmitObjectives(); setOverlay("complete"); }
        } else {
            setOverlay("transition");
        }
    }, [token, attemptId, phaseIndex, allPhases.length, endQuestions.length, autoSubmitObjectives]);

    const handlePhaseEnd = useCallback(() => {
        const nextIdx = phaseIndex + 1;
        if (nextIdx >= allPhases.length) {
            if (phaseQuestions.length > 0)   setOverlay("questions");
            else if (endQuestions.length > 0) setOverlay("questions-end");
            else {
                if (attemptId) {
                    fetch(API(`/attempts/${attemptId}/complete`), {
                        method: "PATCH", headers: { Authorization: `Bearer ${token}` },
                    }).catch(err => console.error("Failed to complete attempt:", err));
                }
                setOverlay("complete");
            }
            return;
        }
        setNextPhaseIdx(nextIdx);
        if (phaseQuestions.length > 0) setOverlay("questions");
        else setOverlay("transition");
    }, [phaseIndex, allPhases.length, phaseQuestions.length, attemptId, token, endQuestions.length]);

    const advancePhase = useCallback(() => {
        const idx = nextPhaseIdx ?? phaseIndex + 1;
        setPhaseIndex(idx);
        setTimeLeft(allPhases[idx].duration_minutes * 60);
        setNarrativeScenarioTime(0);
        setOverlay(null);
        setNextPhaseIdx(null);
    }, [nextPhaseIdx, phaseIndex, allPhases]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === "p" || e.key === "P") handlePhaseEnd(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [handlePhaseEnd]);

    const handleExit = useCallback(() => navigate("/scenarios"), [navigate]);

    // ── Guards ─────────────────────────────────────────────────────────────────
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

                {isNarrative ? (
                    // ── Narrative layout — NarrativeEngine owns evidence + decisions
                    <NarrativeEngine
                        phaseInjects={allInjects.filter(inj =>
                            inj.phase_id === currentPhase?.id
                        )}
                        triggers={allTriggers}
                        timeBudget={currentPhase?.time_budget ?? 30}
                        attemptId={attemptId}
                        token={token}
                        onScenarioTimeChange={setNarrativeScenarioTime}
                    />
                ) : (
                    // ── Open-ended layout — original feed + objectives, unchanged
                    <>
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
                                        <InjectCard key={inj.id} inject={inj} isNew={inj.id === newInjectId} />
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
                    </>
                )}
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
                narrativeScenarioTime={isNarrative ? narrativeScenarioTime : undefined}
            />

            {overlay === "overview" && (
                <OverviewModal
                    scenario={scenarioData} phase={currentPhase}
                    phaseIndex={phaseIndex} totalPhases={allPhases.length}
                    onClose={() => setOverlay(null)} />
            )}
            {overlay === "board" && (
                <InvestigationBoard
                    receivedInjects={receivedInjects}
                    attemptId={attemptId}
                    onClose={() => setOverlay(null)} />
            )}
            {(overlay === "questions" || overlay === "questions-end") && (
                <QuestionsModal
                    questions={overlay === "questions-end" ? endQuestions : phaseQuestions}
                    phaseName={currentPhase?.title}
                    isEndOfScenario={overlay === "questions-end"}
                    submitting={submitting}
                    onSubmit={(answers) => handleSubmitAnswers(answers, overlay === "questions-end")} />
            )}
            {overlay === "transition" && (
                <PhaseTransitionOverlay
                    phase={allPhases[nextPhaseIdx ?? phaseIndex + 1]}
                    phaseIndex={nextPhaseIdx ?? phaseIndex + 1}
                    onDone={advancePhase} />
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
                    <button className="sim-proceed-btn sim-proceed-btn--ready" onClick={handleExit}>
                        [ EXIT SIMULATION ]
                    </button>
                </div>
            )}

            <div className="sim-demo-hint">PRESS P TO ADVANCE PHASE</div>
        </div>
    );
}