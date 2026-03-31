import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import './Results.css';
import { getToken } from '../../utils/auth';
import { API } from '../../utils/api';

// ─── Top-level view states ────────────────────────────────────────────────────
const VIEW = { HISTORY: 'history', ATTEMPT: 'attempt' };

export default function Results() {
    const navigate = useNavigate();

    const [view,           setView]           = useState(VIEW.HISTORY);
    const [history,        setHistory]        = useState([]);
    const [loading,        setLoading]        = useState(true);
    const [error,          setError]          = useState(null);
    const [selectedAttempt, setSelectedAttempt] = useState(null); // { attemptId, scenarioTitle, attemptNumber }

    useEffect(() => { fetchHistory(); }, []);

    function authHeaders() {
        const token = getToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    async function fetchHistory() {
        setLoading(true);
        setError(null);
        try {
            const res  = await fetch(API('/results'), { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setHistory(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    function openAttempt(attemptId, scenarioTitle, attemptNumber) {
        setSelectedAttempt({ attemptId, scenarioTitle, attemptNumber });
        setView(VIEW.ATTEMPT);
    }

    function goBack() {
        setView(VIEW.HISTORY);
        setSelectedAttempt(null);
    }

    if (loading) return (
        <>
            <Navbar />
            <div className="results-page">
                <div className="results-scanlines" />
                <div className="results-loading">
                    &gt; LOADING MISSION RECORD<span className="results-blink">_</span>
                </div>
            </div>
        </>
    );

    if (error) return (
        <>
            <Navbar />
            <div className="results-page">
                <div className="results-scanlines" />
                <div className="results-loading results-loading--error">&gt; ERROR: {error}</div>
            </div>
        </>
    );

    return (
        <>
            <Navbar />
            <div className="results-page">
            <div className="results-scanlines" />

            <header className="results-header">
                <div className="results-header__left">
                    <span className="results-header__logo">DFIR//SIM</span>
                    <span className="results-header__sep">/</span>
                    <span className="results-header__title">MISSION RECORD</span>
                </div>
                {view === VIEW.ATTEMPT && (
                    <button className="results-back-btn" onClick={goBack}>
                        ◂ BACK TO HISTORY
                    </button>
                )}
            </header>

            <main className="results-main">
                {view === VIEW.HISTORY && (
                    <HistoryView
                        history={history}
                        onSelectAttempt={openAttempt}
                    />
                )}
                {view === VIEW.ATTEMPT && (
                    <AttemptView
                        attemptId={selectedAttempt.attemptId}
                        scenarioTitle={selectedAttempt.scenarioTitle}
                        attemptNumber={selectedAttempt.attemptNumber}
                        authHeaders={authHeaders}
                    />
                )}
            </main>
        </div>
        </>
    );
}
// Two-column layout matching the mockup: accordion list on the left,
// detail panel on the right. On the history view the right panel shows
// the selected attempt inline without changing view — clicking the attempt
// row loads the detail into the right column. A separate full-view mode
// is used on narrow screens (handled in CSS).
// ─────────────────────────────────────────────────────────────────────────────
function HistoryView({ history, onSelectAttempt }) {
    // Track which scenario cards are expanded
    const [expanded, setExpanded] = useState(() => {
        if (history.length === 0) return {};
        // Default: expand the first (most recent) scenario
        return { [history[0].scenario_id]: true };
    });

    // Which attempt row is highlighted in the list
    const [activeAttemptId, setActiveAttemptId] = useState(null);

    // The attempt loaded into the right panel
    const [panelAttemptId, setPanelAttemptId] = useState(null);

    // Auto-select the most recent graded attempt on load for a good first impression
    useEffect(() => {
        if (history.length === 0) return;
        const firstScenario = history[0];
        if (!firstScenario.attempts?.length) return;
        const firstGraded = firstScenario.attempts.find(a => a.graded_at);
        const firstAny    = firstScenario.attempts[0];
        const target      = firstGraded || firstAny;
        if (target) {
            setActiveAttemptId(target.id);
            setPanelAttemptId(target.id);
        }
    }, [history]);

    function toggleScenario(scenarioId) {
        setExpanded(prev => ({ ...prev, [scenarioId]: !prev[scenarioId] }));
    }

    function handleAttemptClick(attempt, scenarioTitle) {
        setActiveAttemptId(attempt.id);
        setPanelAttemptId(attempt.id);
    }

    // Total counts for the header
    const totalAttempts = history.reduce((sum, s) => sum + (s.attempts?.length || 0), 0);

    if (history.length === 0) {
        return (
            <div className="results-empty">
                <div className="results-empty__icon">◈</div>
                <div className="results-empty__text">NO COMPLETED OPERATIONS</div>
                <div className="results-empty__sub">Complete a scenario to see your results here</div>
            </div>
        );
    }

    return (
        <div className="results-layout">
            {/* ── Left: accordion list ── */}
            <div className="results-layout__list">
                <div className="results-section-hdr">
                    <span className="results-section-hdr__title">COMPLETED OPERATIONS</span>
                    <span className="results-section-hdr__meta">
                        {history.length} SCENARIO{history.length !== 1 ? 'S' : ''} · {totalAttempts} ATTEMPT{totalAttempts !== 1 ? 'S' : ''}
                    </span>
                </div>

                {history.map(scenario => {
                    const isOpen     = !!expanded[scenario.scenario_id];
                    const hasPending = scenario.attempts?.some(a => !a.graded_at);
                    const bestScore  = scenario.best_score;

                    return (
                        <div key={scenario.scenario_id} className="results-scenario-card">
                            <button
                                className={`results-scenario-card__hdr ${isOpen ? 'results-scenario-card__hdr--open' : ''}`}
                                onClick={() => toggleScenario(scenario.scenario_id)}
                            >
                                <span className="results-scenario-card__arrow">
                                    {isOpen ? '▾' : '▸'}
                                </span>
                                <span className="results-scenario-card__name">
                                    {scenario.scenario_title.toUpperCase()}
                                </span>
                                <div className="results-scenario-card__right">
                                    {scenario.difficulty && (
                                        <span className={`results-diff results-diff--${scenario.difficulty.toLowerCase()}`}>
                                            {scenario.difficulty.toUpperCase()}
                                        </span>
                                    )}
                                    {bestScore !== null ? (
                                        <span className="results-scenario-card__best">
                                            BEST: {Math.round(bestScore)}%
                                        </span>
                                    ) : hasPending ? (
                                        <span className="results-scenario-card__best results-scenario-card__best--pending">
                                            PENDING
                                        </span>
                                    ) : null}
                                </div>
                            </button>

                            {isOpen && (
                                <div className="results-attempts-list">
                                    {scenario.attempts.map(attempt => {
                                        const isActive  = attempt.id === activeAttemptId;
                                        const isGraded  = !!attempt.graded_at;
                                        const pct       = attempt.graded_at ? attempt.score_pct : null;

                                        return (
                                            <button
                                                key={attempt.id}
                                                className={`results-attempt-row ${isActive ? 'results-attempt-row--active' : ''} ${isGraded ? 'results-attempt-row--graded' : 'results-attempt-row--pending'}`}
                                                onClick={() => handleAttemptClick(attempt, scenario.scenario_title)}
                                            >
                                                <span className="results-attempt-row__num">
                                                    ATTEMPT {attempt.attempt_number}
                                                </span>
                                                <span className="results-attempt-row__date">
                                                    {formatDate(attempt.completed_at || attempt.started_at)}
                                                </span>
                                                {isGraded ? (
                                                    <span className="results-badge results-badge--graded">GRADED</span>
                                                ) : (
                                                    <span className="results-badge results-badge--pending">AWAITING GRADER</span>
                                                )}
                                                <span className={`results-attempt-row__score ${!isGraded ? 'results-attempt-row__score--pending' : ''}`}>
                                                    {isGraded && pct !== null ? `${Math.round(pct)}%` : '—'}
                                                </span>
                                                <span className="results-attempt-row__chevron">›</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Right: detail panel ── */}
            <div className="results-layout__detail">
                {panelAttemptId ? (
                    <AttemptDetail
                        key={panelAttemptId}
                        attemptId={panelAttemptId}
                        authHeaders={() => {
                            const token = getToken();
                            return token ? { Authorization: `Bearer ${token}` } : {};
                        }}
                        inline
                    />
                ) : (
                    <div className="results-detail-empty">
                        <div className="results-detail-empty__icon">◈</div>
                        <div className="results-detail-empty__text">SELECT AN ATTEMPT</div>
                    </div>
                )}
            </div>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// ATTEMPT VIEW (full page — used on mobile / narrow)
// Rendered when the user is on a small screen and taps an attempt, or when
// navigated directly. On wider screens the detail renders inline in the
// right column of HistoryView instead.
// ─────────────────────────────────────────────────────────────────────────────
function AttemptView({ attemptId, authHeaders }) {
    return (
        <div className="results-attempt-view">
            <AttemptDetail
                key={attemptId}
                attemptId={attemptId}
                authHeaders={authHeaders}
                inline={false}
            />
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// ATTEMPT DETAIL
// The core display component. Used both in the right-column inline panel and
// as the full-page view. The `inline` prop controls whether it has its own
// scroll container or fills the page.
//
// Handles three states:
//   1. Loading
//   2. Ungraded — shows answers, pending indicator where score would be
//   3. Graded — full score reveal with animated bar + class comparison
// ─────────────────────────────────────────────────────────────────────────────
function AttemptDetail({ attemptId, authHeaders, inline }) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);

    // Controls whether the score bar animation has fired.
    // We delay it slightly so it plays after the panel renders rather than
    // during the loading state transition.
    const [scoreVisible, setScoreVisible] = useState(false);
    const scoreTimer = useRef(null);

    useEffect(() => {
        loadDetail();
        return () => clearTimeout(scoreTimer.current);
    }, [attemptId]);

    async function loadDetail() {
        setLoading(true);
        setError(null);
        setScoreVisible(false);
        try {
            const res  = await fetch(API(`/results/attempts/${attemptId}`), {
                headers: authHeaders()
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.message);
            setData(d);
            // Trigger the score bar animation after a short delay
            if (d.attempt.graded_at) {
                scoreTimer.current = setTimeout(() => setScoreVisible(true), 150);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    if (loading) return (
        <div className="results-detail-loading">
            &gt; RETRIEVING DATA<span className="results-blink">_</span>
        </div>
    );

    if (error) return (
        <div className="results-detail-loading results-loading--error">
            &gt; ERROR: {error}
        </div>
    );

    const { attempt, questions, objectives, totals, class_avg } = data;
    const isGraded = !!attempt.graded_at;
    const questionsByPhase = groupByPhase(questions);

    return (
        <div className={`results-detail ${inline ? 'results-detail--inline' : ''}`}>

            {/* Header */}
            <div className="results-detail__hdr">
                <div className="results-detail__prompt">
                    &gt; {attempt.scenario_title.toUpperCase()}
                </div>
                <div className="results-detail__sub">
                    COMPLETED {formatDate(attempt.completed_at)}
                    {isGraded && ` · GRADED ${formatDate(attempt.graded_at)}`}
                </div>
            </div>

            {/* Score section — different for graded vs pending */}
            {isGraded ? (
                <div className="results-score-section">
                    <div className="results-score-big">
                        <span
                            className={`results-score-big__pct ${scoreVisible ? 'results-score-big__pct--visible' : ''}`}
                        >
                            {Math.round(totals.final_percentage)}%
                        </span>
                        <span className="results-score-big__pts">
                            {totals.earned_score.toFixed(1)} / {totals.max_score.toFixed(1)} PTS
                        </span>
                    </div>

                    {/* Score bar */}
                    <div className="results-score-track">
                        <div
                            className="results-score-fill"
                            style={{
                                width: scoreVisible ? `${Math.round(totals.final_percentage)}%` : '0%'
                            }}
                        />
                    </div>

                    {/* Class comparison — only show if we have a class average */}
                    {class_avg !== null && (
                        <div className="results-compare">
                            <span className="results-compare__label">CLASS AVG</span>
                            <div className="results-compare__track">
                                {/* Class average marker */}
                                <div
                                    className="results-compare__avg-marker"
                                    style={{ left: `${Math.round(class_avg)}%` }}
                                    title={`Class average: ${Math.round(class_avg)}%`}
                                />
                                {/* Student's score marker */}
                                <div
                                    className="results-compare__you-marker"
                                    style={{ left: scoreVisible ? `${Math.round(totals.final_percentage)}%` : '0%' }}
                                    title={`Your score: ${Math.round(totals.final_percentage)}%`}
                                />
                            </div>
                            <span className="results-compare__text">
                                YOU: {Math.round(totals.final_percentage)}% · AVG: {Math.round(class_avg)}%
                            </span>
                        </div>
                    )}
                </div>
            ) : (
                <div className="results-pending-section">
                    <div className="results-pending__icon">◈</div>
                    <div className="results-pending__title">AWAITING GRADER REVIEW</div>
                    <div className="results-pending__sub">
                        Your responses have been recorded.<br />
                        Score will appear here once graded.
                    </div>
                </div>
            )}

            {/* Question responses */}
            <div className="results-detail__body">
                {questionsByPhase.map(({ phaseTitle, phaseOrder, qs }) => (
                    <div key={phaseOrder ?? 'nophase'} className="results-phase-group">
                        <div className="results-phase-lbl">
                            {phaseTitle
                                ? `// PHASE — ${phaseTitle.toUpperCase()}`
                                : '// END-OF-SCENARIO QUESTIONS'
                            }
                        </div>
                        {qs.map((q, i) => (
                            <QuestionResult
                                key={q.response_id}
                                index={i}
                                question={q}
                                isGraded={isGraded}
                            />
                        ))}
                    </div>
                ))}

                {/* Side objectives */}
                {objectives.length > 0 && (
                    <div className="results-phase-group">
                        <div className="results-phase-lbl">// SIDE OBJECTIVES</div>
                        {objectives.map(o => (
                            <ObjectiveResult
                                key={o.response_id}
                                objective={o}
                                isGraded={isGraded}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// QUESTION RESULT ROW
// Shows the question text, the student's answer, their score (if graded),
// and the grader's note (if one was left and the attempt is graded).
// ─────────────────────────────────────────────────────────────────────────────
function QuestionResult({ index, question, isGraded }) {
    return (
        <div className="results-q-item">
            <div className="results-q-item__top">
                <span className="results-q-item__qtext">
                    <span className="results-q-item__num">
                        [{String(index + 1).padStart(2, '0')}]
                    </span>
                    {question.question_text}
                </span>
                {isGraded ? (
                    <span className="results-q-item__score">
                        {question.score !== null
                            ? `${question.score}/${question.max_score}`
                            : `—/${question.max_score}`
                        }
                    </span>
                ) : (
                    <span className="results-q-item__score results-q-item__score--pending">
                        —/{question.max_score}
                    </span>
                )}
            </div>

            <div className="results-q-item__answer">
                {question.answer || (
                    <span className="results-no-answer">NO ANSWER SUBMITTED</span>
                )}
            </div>

            {/* Only render the note block if graded AND a note exists */}
            {isGraded && question.grader_notes && (
                <div className="results-q-item__note">
                    <span className="results-q-item__note-label">&gt; GRADER NOTE</span>
                    {question.grader_notes}
                </div>
            )}
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// OBJECTIVE RESULT ROW
// Side objectives always show is_correct (the student saw this live during
// the simulation). Score is added alongside if the attempt is graded.
// ─────────────────────────────────────────────────────────────────────────────
function ObjectiveResult({ objective, isGraded }) {
    const correct = objective.is_correct;

    return (
        <div className={`results-obj-item ${correct ? 'results-obj-item--correct' : 'results-obj-item--wrong'}`}>
            <span className={`results-obj-item__bullet ${correct ? 'results-obj-item__bullet--correct' : 'results-obj-item__bullet--wrong'}`}>
                ◆
            </span>
            <span className="results-obj-item__desc">{objective.description}</span>
            <span className={`results-obj-item__result ${correct ? 'results-obj-item__result--correct' : 'results-obj-item__result--wrong'}`}>
                {correct ? 'CORRECT' : 'INCORRECT'}
                {isGraded && objective.score !== null && ` · ${objective.score}/${objective.max_score}`}
            </span>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function groupByPhase(questions) {
    const map = new Map();
    questions.forEach(q => {
        const key = q.phase_id ?? '__none__';
        if (!map.has(key)) {
            map.set(key, {
                phaseTitle: q.phase_title,
                phaseOrder: q.phase_order ?? 9999,
                qs: []
            });
        }
        map.get(key).qs.push(q);
    });
    return [...map.values()].sort((a, b) => a.phaseOrder - b.phaseOrder);
}

function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-AU', {
        day:   '2-digit',
        month: 'short',
        year:  'numeric'
    });
}