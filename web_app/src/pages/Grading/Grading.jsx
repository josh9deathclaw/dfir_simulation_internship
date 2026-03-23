import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import './Grading.css';
import { getToken } from '../../utils/auth';

const API = (path) => `${process.env.REACT_APP_API_URL}/api${path}`;

// ─── Top-level view states ────────────────────────────────────────────────────
const VIEW = { CLASSES: 'classes', STUDENTS: 'students', ATTEMPT: 'attempt' };

export default function Grading() {
    const navigate = useNavigate();

    const [view, setView]           = useState(VIEW.CLASSES);
    const [classes, setClasses]     = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(null);

    // Breadcrumb context — what's currently selected
    const [selectedClass,    setSelectedClass]    = useState(null);
    const [selectedScenario, setSelectedScenario] = useState(null);
    const [selectedAttempt,  setSelectedAttempt]  = useState(null);

    // Fetch the class list on mount
    useEffect(() => {
        fetchClasses();
    }, []);

    async function fetchClasses() {
        setLoading(true);
        setError(null);
        try {
            const res  = await fetch(API('/grading/classes'), { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setClasses(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    function authHeaders() {
        const token = getToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    // ── Navigation helpers ────────────────────────────────────────────────────
    function openScenario(cls, scenario) {
        setSelectedClass(cls);
        setSelectedScenario(scenario);
        setView(VIEW.STUDENTS);
    }

    function openAttempt(attemptId) {
        setSelectedAttempt(attemptId);
        setView(VIEW.ATTEMPT);
    }

    function goToClasses() {
        setView(VIEW.CLASSES);
        setSelectedClass(null);
        setSelectedScenario(null);
        setSelectedAttempt(null);
    }

    function goToStudents() {
        setView(VIEW.STUDENTS);
        setSelectedAttempt(null);
    }

    // ── Render ────────────────────────────────────────────────────────────────
    if (loading) return (
        <>
            <Navbar />
            <div className="grading-page">
                <div className="grading-scanlines" />
                <div className="grading-loading">&gt; LOADING CLASSES<span className="grading-blink">_</span></div>
            </div>
        </>
    );
    if (error) return (
        <>
            <Navbar />
            <div className="grading-page">
                <div className="grading-scanlines" />
                <div className="grading-loading grading-loading--error">&gt; ERROR: {error}</div>
            </div>
        </>
    );

    return (
        <>
            <Navbar />
            <div className="grading-page">
                <div className="grading-scanlines" />

            <header className="grading-header">
                <div className="grading-header__left">
                    <span className="grading-header__logo">DFIR//SIM</span>
                    <span className="grading-header__sep">/</span>
                    <span className="grading-header__title">GRADING CONSOLE</span>
                </div>
                <Breadcrumb
                    view={view}
                    cls={selectedClass}
                    scenario={selectedScenario}
                    onClickClasses={goToClasses}
                    onClickStudents={goToStudents}
                />
            </header>

            <main className="grading-main">
                {view === VIEW.CLASSES  && (
                    <ClassList classes={classes} onSelect={openScenario} />
                )}
                {view === VIEW.STUDENTS && (
                    <StudentList
                        cls={selectedClass}
                        scenario={selectedScenario}
                        onSelectAttempt={openAttempt}
                        authHeaders={authHeaders}
                    />
                )}
                {view === VIEW.ATTEMPT  && (
                    <AttemptDetail
                        attemptId={selectedAttempt}
                        authHeaders={authHeaders}
                        onGraded={goToStudents}
                    />
                )}
            </main>
        </div>
        </>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// BREADCRUMB
// ─────────────────────────────────────────────────────────────────────────────
function Breadcrumb({ view, cls, scenario, onClickClasses, onClickStudents }) {
    return (
        <nav className="grading-breadcrumb">
            <button className="grading-breadcrumb__item" onClick={onClickClasses}>
                CLASSES
            </button>
            {cls && <>
                <span className="grading-breadcrumb__sep">/</span>
                <button
                    className="grading-breadcrumb__item"
                    onClick={view === VIEW.ATTEMPT ? onClickStudents : undefined}
                    style={{ cursor: view === VIEW.ATTEMPT ? 'pointer' : 'default' }}
                >
                    {cls.name.toUpperCase()}
                </button>
            </>}
            {scenario && <>
                <span className="grading-breadcrumb__sep">/</span>
                <button
                    className="grading-breadcrumb__item"
                    onClick={view === VIEW.ATTEMPT ? onClickStudents : undefined}
                    style={{ cursor: view === VIEW.ATTEMPT ? 'pointer' : 'default' }}
                >
                    {scenario.title.toUpperCase()}
                </button>
            </>}
            {view === VIEW.ATTEMPT && <>
                <span className="grading-breadcrumb__sep">/</span>
                <span className="grading-breadcrumb__item grading-breadcrumb__item--active">
                    ATTEMPT DETAIL
                </span>
            </>}
        </nav>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// CLASS LIST
// Shows each class the teacher owns. Each class expands to list its assigned
// scenarios with needs_grading / total_completed counts.
// ─────────────────────────────────────────────────────────────────────────────
function ClassList({ classes, onSelect }) {
    // Track which classes are expanded. We default the first one open if there
    // is only one class, otherwise all collapsed.
    const [expanded, setExpanded] = useState(() =>
        classes.length === 1 ? { [classes[0].id]: true } : {}
    );

    function toggle(id) {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    }

    if (classes.length === 0) {
        return (
            <div className="grading-empty">
                <div className="grading-empty__icon">◈</div>
                <div className="grading-empty__text">NO CLASSES FOUND</div>
                <div className="grading-empty__sub">Create a class and assign scenarios to begin grading</div>
            </div>
        );
    }

    return (
        <div className="grading-class-list">
            {classes.map(cls => {
                const isOpen     = !!expanded[cls.id];
                const scenarios  = cls.scenarios || [];
                const totalNeeds = scenarios.reduce((sum, s) => sum + (s.needs_grading || 0), 0);

                return (
                    <div key={cls.id} className="grading-class-card">
                        <button
                            className="grading-class-card__header"
                            onClick={() => toggle(cls.id)}
                        >
                            <div className="grading-class-card__left">
                                <span className="grading-class-card__arrow">
                                    {isOpen ? '▾' : '▸'}
                                </span>
                                <span className="grading-class-card__name">{cls.name}</span>
                                <span className="grading-class-card__meta">
                                    {cls.student_count} STUDENT{cls.student_count !== 1 ? 'S' : ''}
                                </span>
                            </div>
                            <div className="grading-class-card__right">
                                {totalNeeds > 0 && (
                                    <span className="grading-badge grading-badge--urgent">
                                        {totalNeeds} NEED{totalNeeds !== 1 ? 'S' : ''} GRADING
                                    </span>
                                )}
                                <span className="grading-class-card__code">
                                    {cls.enrolment_code}
                                </span>
                            </div>
                        </button>

                        {isOpen && (
                            <div className="grading-class-card__scenarios">
                                {scenarios.length === 0 ? (
                                    <div className="grading-class-card__empty">
                                        NO SCENARIOS ASSIGNED TO THIS CLASS
                                    </div>
                                ) : scenarios.map(s => (
                                    <button
                                        key={s.id}
                                        className="grading-scenario-row"
                                        onClick={() => onSelect(cls, s)}
                                    >
                                        <div className="grading-scenario-row__left">
                                            <span className="grading-scenario-row__prompt">&gt;_</span>
                                            <span className="grading-scenario-row__title">{s.title}</span>
                                            {s.difficulty && (
                                                <span className={`grading-diff grading-diff--${s.difficulty.toLowerCase()}`}>
                                                    {s.difficulty.toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <div className="grading-scenario-row__right">
                                            {s.needs_grading > 0 && (
                                                <span className="grading-badge grading-badge--urgent">
                                                    {s.needs_grading} PENDING
                                                </span>
                                            )}
                                            <span className="grading-scenario-row__total">
                                                {s.total_completed} COMPLETED
                                            </span>
                                            <span className="grading-scenario-row__chevron">›</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// STUDENT LIST
// Shows all enrolled students for a given class + scenario. Fetches fresh on
// mount. Each student shows their attempts with grading_status badges.
// ─────────────────────────────────────────────────────────────────────────────
function StudentList({ cls, scenario, onSelectAttempt, authHeaders }) {
    const [students, setStudents] = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState(null);

    useEffect(() => {
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const res  = await fetch(
                    API(`/grading/classes/${cls.id}/scenarios/${scenario.id}/students`),
                    { headers: authHeaders() }
                );
                const data = await res.json();
                if (!res.ok) throw new Error(data.message);
                setStudents(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [cls.id, scenario.id]);

    if (loading) return <div className="grading-loading">&gt; LOADING STUDENTS<span className="grading-blink">_</span></div>;
    if (error)   return <div className="grading-loading grading-loading--error">&gt; ERROR: {error}</div>;

    const withAttempts    = students.filter(s => s.attempts.length > 0);
    const withoutAttempts = students.filter(s => s.attempts.length === 0);

    return (
        <div className="grading-student-list">
            <div className="grading-section-header">
                <span className="grading-section-header__title">{scenario.title.toUpperCase()}</span>
                <span className="grading-section-header__meta">
                    {students.length} ENROLLED · {withAttempts.length} ATTEMPTED
                </span>
            </div>

            {withAttempts.length === 0 && withoutAttempts.length === 0 && (
                <div className="grading-empty">
                    <div className="grading-empty__icon">◈</div>
                    <div className="grading-empty__text">NO STUDENTS ENROLLED</div>
                </div>
            )}

            {/* Students who have at least one attempt */}
            {withAttempts.map(student => (
                <StudentCard
                    key={student.id}
                    student={student}
                    onSelectAttempt={onSelectAttempt}
                />
            ))}

            {/* Students with no attempts — shown as a collapsed section */}
            {withoutAttempts.length > 0 && (
                <NotStartedSection students={withoutAttempts} />
            )}
        </div>
    );
}

function StudentCard({ student, onSelectAttempt }) {
    const initials = `${student.first_name[0]}${student.last_name[0]}`.toUpperCase();

    return (
        <div className="grading-student-card">
            <div className="grading-student-card__header">
                <div className="grading-student-card__avatar">{initials}</div>
                <div className="grading-student-card__info">
                    <span className="grading-student-card__name">
                        {student.last_name.toUpperCase()}, {student.first_name.toUpperCase()}
                    </span>
                    <span className="grading-student-card__email">{student.email}</span>
                </div>
            </div>
            <div className="grading-student-card__attempts">
                {student.attempts.map((attempt, i) => (
                    <button
                        key={attempt.id}
                        className={`grading-attempt-row grading-attempt-row--${attempt.grading_status}`}
                        onClick={() => onSelectAttempt(attempt.id)}
                    >
                        <span className="grading-attempt-row__label">
                            ATTEMPT {student.attempts.length - i}
                        </span>
                        <span className="grading-attempt-row__date">
                            {formatDate(attempt.completed_at || attempt.started_at)}
                        </span>
                        <StatusBadge status={attempt.grading_status} />
                        <span className="grading-attempt-row__chevron">›</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function NotStartedSection({ students }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="grading-not-started">
            <button
                className="grading-not-started__toggle"
                onClick={() => setOpen(o => !o)}
            >
                <span>{open ? '▾' : '▸'}</span>
                <span>NOT STARTED ({students.length})</span>
            </button>
            {open && (
                <div className="grading-not-started__list">
                    {students.map(s => (
                        <div key={s.id} className="grading-not-started__row">
                            <span className="grading-not-started__name">
                                {s.last_name.toUpperCase()}, {s.first_name.toUpperCase()}
                            </span>
                            <span className="grading-not-started__email">{s.email}</span>
                            <span className="grading-badge grading-badge--dim">NO ATTEMPT</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// ATTEMPT DETAIL
// The main grading view. Two-column layout: left shows the student's answers,
// right shows the scoring inputs. Score bar updates live as inputs change.
// ─────────────────────────────────────────────────────────────────────────────
function AttemptDetail({ attemptId, authHeaders, onGraded }) {
    const [data,        setData]        = useState(null);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState(null);
    const [submitting,  setSubmitting]  = useState(false);
    const [submitError, setSubmitError] = useState(null);

    // Local score state — a map of responseId → { score, grader_notes }
    // This is what the inputs are bound to. On save/submit we flush from here.
    const [scores, setScores] = useState({});

    // Debounce timer ref — we auto-save 1.5s after the teacher stops typing
    const saveTimers = useRef({});

    useEffect(() => {
        loadAttempt();
    }, [attemptId]);

    async function loadAttempt() {
        setLoading(true);
        setError(null);
        try {
            const res  = await fetch(API(`/grading/attempts/${attemptId}`), {
                headers: authHeaders()
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.message);
            setData(d);

            // Seed local score state from whatever the server already has.
            // This means if a teacher partially graded and comes back, their
            // previous scores are pre-filled.
            const initial = {};
            [...d.questions, ...d.objectives].forEach(r => {
                initial[r.response_id] = {
                    score:        r.score ?? '',
                    grader_notes: r.grader_notes ?? ''
                };
            });
            setScores(initial);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    // Called whenever a score input changes. Updates local state immediately
    // for a responsive UI, then schedules a debounced auto-save so we're not
    // hammering the API on every keystroke.
    function handleScoreChange(responseId, field, value) {
        setScores(prev => ({
            ...prev,
            [responseId]: { ...prev[responseId], [field]: value }
        }));

        // Clear any pending save for this response and schedule a new one
        clearTimeout(saveTimers.current[responseId]);
        saveTimers.current[responseId] = setTimeout(() => {
            saveSingleResponse(responseId, {
                ...scores[responseId],
                [field]: value
            });
        }, 1500);
    }

    async function saveSingleResponse(responseId, values) {
        const score = values.score === '' ? null : parseFloat(values.score);
        try {
            await fetch(API(`/grading/attempts/${attemptId}/responses/${responseId}`), {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body:    JSON.stringify({ score, grader_notes: values.grader_notes || null })
            });
        } catch {
            // Silent fail on auto-save — the teacher can retry via Save Draft
        }
    }

    // Manual save draft — flushes all current scores immediately without
    // waiting for the debounce timers.
    async function saveDraft() {
        // Cancel all pending debounce timers since we're saving everything now
        Object.values(saveTimers.current).forEach(clearTimeout);

        await Promise.all(
            Object.entries(scores).map(([responseId, values]) =>
                saveSingleResponse(responseId, values)
            )
        );
    }

    // Final submit — saves everything then calls the /submit endpoint which
    // stamps graded_at. The backend will reject if any score is still null.
    async function handleSubmit() {
        setSubmitting(true);
        setSubmitError(null);
        try {
            await saveDraft();
            const res  = await fetch(API(`/grading/attempts/${attemptId}/submit`), {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() }
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.message);
            onGraded();
        } catch (err) {
            setSubmitError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    // Compute live totals from local scores state rather than from the server's
    // totals, so the score bar responds immediately to input changes without
    // a round-trip. We still need max_score from the server data.
    function computeLiveTotals() {
        if (!data) return { earned: 0, max: 0, pct: 0, unscored: 0 };

        let earned   = 0;
        let max      = 0;
        let unscored = 0;

        const allResponses = [...data.questions, ...data.objectives];
        allResponses.forEach(r => {
            max += parseFloat(r.max_score) || 0;
            const localScore = scores[r.response_id]?.score;
            if (localScore === '' || localScore === null || localScore === undefined) {
                unscored++;
            } else {
                earned += parseFloat(localScore) || 0;
            }
        });

        const pct = max > 0 ? Math.round((earned / max) * 100) : 0;
        return { earned, max, pct, unscored };
    }

    if (loading) return <div className="grading-loading">&gt; LOADING ATTEMPT<span className="grading-blink">_</span></div>;
    if (error)   return <div className="grading-loading grading-loading--error">&gt; ERROR: {error}</div>;

    const { attempt, questions, objectives } = data;
    const totals = computeLiveTotals();
    const isAlreadyGraded = !!attempt.graded_at;

    // Group questions by phase for the left panel display
    const questionsByPhase = groupByPhase(questions);

    return (
        <div className="grading-attempt">

            {/* Score bar — always visible at top */}
            <div className="grading-score-bar">
                <div className="grading-score-bar__pct">{totals.pct}%</div>
                <div className="grading-score-bar__track">
                    <div
                        className="grading-score-bar__fill"
                        style={{ width: `${totals.pct}%` }}
                    />
                </div>
                <div className="grading-score-bar__detail">
                    {totals.earned.toFixed(1)} / {totals.max.toFixed(1)} PTS
                </div>
                {totals.unscored > 0 && (
                    <div className="grading-score-bar__unscored">
                        {totals.unscored} UNSCORED
                    </div>
                )}
                {isAlreadyGraded && (
                    <span className="grading-badge grading-badge--graded">GRADED</span>
                )}
            </div>

            <div className="grading-attempt__cols">

                {/* ── LEFT: student's answers ── */}
                <div className="grading-attempt__answers">
                    <div className="grading-col-title">STUDENT RESPONSES</div>

                    {questionsByPhase.map(({ phaseTitle, phaseOrder, qs }) => (
                        <div key={phaseOrder ?? 'nophase'} className="grading-phase-group">
                            <div className="grading-phase-group__label">
                                {phaseTitle
                                    ? `// PHASE — ${phaseTitle.toUpperCase()}`
                                    : '// END-OF-SCENARIO QUESTIONS'
                                }
                            </div>
                            {qs.map((q, i) => (
                                <div key={q.response_id} className="grading-answer-block">
                                    <div className="grading-answer-block__qtext">
                                        <span className="grading-answer-block__qnum">Q{i + 1}</span>
                                        {q.question_text}
                                    </div>
                                    <div className="grading-answer-block__answer">
                                        {q.answer || <span className="grading-no-answer">NO ANSWER SUBMITTED</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}

                    {objectives.length > 0 && (
                        <div className="grading-phase-group">
                            <div className="grading-phase-group__label">// SIDE OBJECTIVES</div>
                            {objectives.map(o => (
                                <div key={o.response_id} className={`grading-answer-block grading-answer-block--obj ${o.is_correct ? 'grading-answer-block--correct' : 'grading-answer-block--wrong'}`}>
                                    <div className="grading-answer-block__qtext">
                                        <span className="grading-answer-block__obj-bullet">◆</span>
                                        {o.description}
                                    </div>
                                    <div className="grading-answer-block__answer">
                                        {o.answer || <span className="grading-no-answer">NO ANSWER SUBMITTED</span>}
                                    </div>
                                    <div className="grading-answer-block__auto">
                                        AUTO-SCORE:&nbsp;
                                        <span className={o.is_correct ? 'grading-text--green' : 'grading-text--red'}>
                                            {o.is_correct ? 'CORRECT' : 'INCORRECT'}
                                        </span>
                                        &nbsp;·&nbsp;{o.attempts_used} ATTEMPT{o.attempts_used !== 1 ? 'S' : ''} USED
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── RIGHT: scoring panel ── */}
                <div className="grading-attempt__scoring">
                    <div className="grading-col-title">SCORING</div>

                    {questionsByPhase.map(({ phaseTitle, phaseOrder, qs }) => (
                        <div key={phaseOrder ?? 'nophase'} className="grading-phase-group">
                            <div className="grading-phase-group__label">
                                {phaseTitle
                                    ? phaseTitle.toUpperCase()
                                    : 'END-OF-SCENARIO'
                                }
                            </div>
                            {qs.map((q, i) => (
                                <ScoreInput
                                    key={q.response_id}
                                    label={`Q${i + 1} — ${q.question_text.slice(0, 48)}${q.question_text.length > 48 ? '…' : ''}`}
                                    maxScore={q.max_score}
                                    values={scores[q.response_id] || { score: '', grader_notes: '' }}
                                    onChange={(field, val) => handleScoreChange(q.response_id, field, val)}
                                    disabled={isAlreadyGraded}
                                    type="manual"
                                />
                            ))}
                        </div>
                    ))}

                    {objectives.length > 0 && (
                        <div className="grading-phase-group">
                            <div className="grading-phase-group__label">SIDE OBJECTIVES</div>
                            {objectives.map(o => (
                                <ScoreInput
                                    key={o.response_id}
                                    label={o.description.slice(0, 48) + (o.description.length > 48 ? '…' : '')}
                                    maxScore={o.max_score}
                                    values={scores[o.response_id] || { score: '', grader_notes: '' }}
                                    onChange={(field, val) => handleScoreChange(o.response_id, field, val)}
                                    disabled={isAlreadyGraded}
                                    type="auto"
                                    autoCorrect={o.is_correct}
                                    autoScore={o.is_correct ? o.max_score : 0}
                                    onResetAuto={() => {
                                        const autoVal = o.is_correct ? o.max_score : 0;
                                        handleScoreChange(o.response_id, 'score', autoVal);
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* Footer actions */}
                    <div className="grading-actions">
                        {submitError && (
                            <div className="grading-actions__error">{submitError}</div>
                        )}
                        <div className="grading-actions__row">
                            <button
                                className="grading-btn"
                                onClick={saveDraft}
                                disabled={isAlreadyGraded}
                            >
                                SAVE DRAFT
                            </button>
                            <button
                                className={`grading-btn grading-btn--primary ${totals.unscored === 0 ? 'grading-btn--ready' : ''}`}
                                onClick={handleSubmit}
                                disabled={submitting || isAlreadyGraded || totals.unscored > 0}
                                title={totals.unscored > 0 ? `${totals.unscored} response(s) still need a score` : ''}
                            >
                                {submitting ? 'SUBMITTING...' : 'SUBMIT GRADE'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// SCORE INPUT
// A single scoring row in the right panel. Used for both questions (manual)
// and side objectives (auto-scored with override). Shows a "Reset to auto"
// link for objectives so the teacher can undo their override.
// ─────────────────────────────────────────────────────────────────────────────
function ScoreInput({ label, maxScore, values, onChange, disabled, type, autoCorrect, autoScore, onResetAuto }) {
    const scoreNum = parseFloat(values.score);
    const isOver   = !isNaN(scoreNum) && scoreNum > parseFloat(maxScore);

    return (
        <div className={`grading-score-input ${isOver ? 'grading-score-input--over' : ''}`}>
            <div className="grading-score-input__label">{label}</div>
            <div className="grading-score-input__row">
                <div className="grading-score-input__field">
                    <input
                        type="number"
                        min="0"
                        max={maxScore}
                        step="0.5"
                        value={values.score}
                        onChange={e => onChange('score', e.target.value)}
                        disabled={disabled}
                        className={`grading-score-input__num ${isOver ? 'grading-score-input__num--over' : ''}`}
                        placeholder="—"
                    />
                    <span className="grading-score-input__max">/ {maxScore}</span>
                </div>
                {type === 'auto' && !disabled && (
                    <button
                        className="grading-score-input__reset"
                        onClick={onResetAuto}
                        title={`Reset to auto: ${autoCorrect ? 'correct' : 'incorrect'} (${autoScore} pts)`}
                    >
                        RESET AUTO
                    </button>
                )}
                {type === 'manual' && (
                    <span className="grading-score-input__tag">MANUAL</span>
                )}
            </div>
            <textarea
                className="grading-score-input__notes"
                placeholder="GRADER NOTES (OPTIONAL)..."
                value={values.grader_notes}
                onChange={e => onChange('grader_notes', e.target.value)}
                disabled={disabled}
                rows={2}
            />
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const map = {
        graded:       { label: 'GRADED',      cls: 'graded'    },
        needs_grading:{ label: 'NEEDS GRADING',cls: 'urgent'   },
        in_progress:  { label: 'IN PROGRESS', cls: 'progress'  },
        abandoned:    { label: 'ABANDONED',   cls: 'dim'       },
    };
    const { label, cls } = map[status] || { label: status.toUpperCase(), cls: 'dim' };
    return <span className={`grading-badge grading-badge--${cls}`}>{label}</span>;
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Groups question-responses by phase. Returns an array of
// { phaseTitle, phaseOrder, qs } sorted by phase order, with end-of-scenario
// questions (phase_id = null) appended at the end.
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
    const d = new Date(iso);
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}