// src/pages/scenarios/Scenarios.jsx
// Only the changed parts are shown below — everything else is identical to your original.
// Changes:
//   1. ModePickerModal component added
//   2. showModePicker state added
//   3. "+ Create Scenario" button opens modal instead of navigating directly
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { getUser, getToken } from "../../utils/auth";
import "./Scenarios.css";
import { API } from "../../utils/api";

// ─── Helpers (unchanged) ──────────────────────────────────────────────────────
const DIFFICULTY_CONFIG = {
    easy:   { label: "Easy",   color: "#52b788" },
    medium: { label: "Medium", color: "#f4a261" },
    hard:   { label: "Hard",   color: "#e63946" },
};

const ACCENT_PALETTE = [
    { accent: "#e63946", coverDark: "#0f1923", coverLight: "#fce8ea" },
    { accent: "#f4a261", coverDark: "#0d1b2a", coverLight: "#fef0e6" },
    { accent: "#7b2fff", coverDark: "#1a0a2e", coverLight: "#ede8ff" },
    { accent: "#52b788", coverDark: "#0a1f0a", coverLight: "#e6f5ed" },
    { accent: "#ffd166", coverDark: "#1a1200", coverLight: "#fef9e6" },
    { accent: "#4cc9f0", coverDark: "#001a2c", coverLight: "#e6f7fd" },
    { accent: "#f72585", coverDark: "#1a0011", coverLight: "#fde6f2" },
];

function getColorsFromId(id = "") {
    const sum = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return ACCENT_PALETTE[sum % ACCENT_PALETTE.length];
}

function getCurrentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function formatTime(mins) {
    if (!mins) return null;
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
}

// ─── Mode Picker Modal ────────────────────────────────────────────────────────
function ModePickerModal({ onClose, onPick }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const modes = [
        {
            id: "open_ended",
            label: "Open-ended",
            icon: "◈",
            accent: "#4cc9f0",
            description: "Evidence is released over time. Students investigate freely with no decision branching. Best for straightforward forensic exercises.",
            features: ["Timed evidence release", "Phase-gated progression", "Free investigation"],
        },
        {
            id: "narrative",
            label: "Narrative",
            icon: "⬡",
            accent: "#7b2fff",
            description: "Students make decisions that affect which evidence they can access and its quality. Evidence degrades if ignored. Best for realistic, high-stakes scenarios.",
            features: ["Decision branching", "Evidence volatility", "Time pressure mechanics"],
        },
    ];

    return (
        <div className="sc-modal-backdrop" onClick={onClose}>
            <div className="sc-modal sc-modal--mode-picker" onClick={(e) => e.stopPropagation()}>
                <div className="sc-modal__bar" style={{ background: "linear-gradient(90deg, #7b2fff, #4cc9f0)" }} />

                <div className="sc-modal__hero" style={{ background: "radial-gradient(ellipse at 80% 0%, #7b2fff18 0%, transparent 60%)" }}>
                    <div className="sc-modal__hero-top">
                        <div className="sc-modal__hero-left">
                            <h2 className="sc-modal__title">Choose a scenario type</h2>
                            <p className="sc-modal__subtitle">This affects how the scenario works for students. You can't change it after creation.</p>
                        </div>
                        <button className="sc-modal__close" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="sc-modal__body sc-mode-picker__body">
                    {modes.map((m) => (
                        <button
                            key={m.id}
                            className="sc-mode-card"
                            style={{ "--mode-accent": m.accent }}
                            onClick={() => onPick(m.id)}
                        >
                            <div className="sc-mode-card__icon" style={{ color: m.accent }}>{m.icon}</div>
                            <div className="sc-mode-card__content">
                                <div className="sc-mode-card__label" style={{ color: m.accent }}>{m.label}</div>
                                <p className="sc-mode-card__desc">{m.description}</p>
                                <ul className="sc-mode-card__features">
                                    {m.features.map((f) => (
                                        <li key={f} style={{ color: m.accent }}>✓ {f}</li>
                                    ))}
                                </ul>
                            </div>
                            <div className="sc-mode-card__arrow">→</div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Join Class Modal (unchanged) ─────────────────────────────────────────────
function JoinClassModal({ onClose, onJoined }) {
    const [code,    setCode]    = useState("");
    const [error,   setError]   = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(null);
    const token = getToken();

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const handleJoin = async () => {
        const trimmed = code.trim().toUpperCase();
        if (!trimmed) { setError("Please enter an enrolment code."); return; }
        if (trimmed.length !== 6) { setError("Enrolment codes are 6 characters long."); return; }
        setLoading(true); setError("");
        try {
            const res = await fetch(API("/classes/join"), {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ code: trimmed }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.message || "Failed to join class."); return; }
            setSuccess({ className: data.class_name });
            onJoined();
        } catch { setError("Network error. Please try again."); }
        finally { setLoading(false); }
    };

    return (
        <div className="sc-modal-backdrop" onClick={onClose}>
            <div className="sc-modal sc-modal--join" onClick={(e) => e.stopPropagation()}>
                <div className="sc-modal__bar" style={{ background: "linear-gradient(90deg, #4cc9f0, #4cc9f044)" }} />
                <div className="sc-modal__hero" style={{ background: "radial-gradient(ellipse at 90% 0%, #4cc9f018 0%, transparent 60%)" }}>
                    <div className="sc-modal__hero-top">
                        <div className="sc-modal__hero-left">
                            <h2 className="sc-modal__title">Join a Class</h2>
                            <p className="sc-modal__subtitle">Enter the enrolment code your teacher gave you.</p>
                        </div>
                        <button className="sc-modal__close" onClick={onClose}>✕</button>
                    </div>
                </div>
                <div className="sc-modal__body">
                    {success ? (
                        <div className="sc-join-success">
                            <div className="sc-join-success__icon">✓</div>
                            <div className="sc-join-success__title">Enrolled successfully</div>
                            <div className="sc-join-success__class">{success.className}</div>
                            <p className="sc-join-success__desc">Your scenarios from this class are now available below.</p>
                            <button className="sc-btn sc-btn--primary" style={{ background: "#4cc9f0", color: "#000" }} onClick={onClose}>View Scenarios</button>
                        </div>
                    ) : (
                        <>
                            <div className="sc-join-input-wrap">
                                <input className="sc-join-input" value={code}
                                    onChange={(e) => { setCode(e.target.value.toUpperCase().slice(0, 6)); setError(""); }}
                                    placeholder="e.g. XK4F9R" maxLength={6} autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                                    spellCheck={false} autoComplete="off" />
                                <div className="sc-join-input__len">{code.length}/6</div>
                            </div>
                            {error && <div className="sc-join-error">{error}</div>}
                            <div className="sc-modal__actions" style={{ marginTop: 20 }}>
                                <button className="sc-btn sc-btn--primary"
                                    style={{ background: "#4cc9f0", color: "#000", boxShadow: "0 4px 20px #4cc9f044" }}
                                    onClick={handleJoin} disabled={loading || code.length !== 6}>
                                    {loading ? "Joining…" : "Join Class →"}
                                </button>
                                <button className="sc-btn sc-btn--ghost" onClick={onClose}>Cancel</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── ScenarioCard (unchanged) ─────────────────────────────────────────────────
function ScenarioCard({ scenario, userId, userRole, onClick }) {
    const [hovered, setHovered] = useState(false);
    const [theme, setTheme] = useState(getCurrentTheme);
    useEffect(() => {
        const observer = new MutationObserver(() => setTheme(getCurrentTheme()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const isOwner = scenario.created_by === userId;
    const diff    = DIFFICULTY_CONFIG[scenario.difficulty];
    const colors  = getColorsFromId(scenario.id);
    const time    = formatTime(scenario.estimated_time_minutes);
    const cover   = theme === "light" ? colors.coverLight : colors.coverDark;
    const titleColor = theme === "light" ? "rgba(10, 15, 30, 0.90)" : "#ffffff";
    const metaColor  = theme === "light" ? "rgba(10, 15, 30, 0.50)" : "rgba(255,255,255,0.38)";

    return (
        <div
            className={`sc-card${hovered ? " sc-card--hovered" : ""}`}
            style={{
                background: cover,
                borderColor: hovered ? `${colors.accent}55` : (theme === "light" ? `${colors.accent}30` : "rgba(255,255,255,0.06)"),
                boxShadow: hovered
                    ? `0 20px 60px ${colors.accent}30, 0 0 0 1px ${colors.accent}22`
                    : theme === "light" ? `0 4px 20px ${colors.accent}18` : "0 4px 20px rgba(0,0,0,0.4)",
            }}
            onClick={() => onClick({ ...scenario, accentColor: colors.accent })}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div className="sc-card__glow" style={{ background: `radial-gradient(ellipse at 80% 20%, ${colors.accent}22 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, ${colors.accent}11 0%, transparent 50%)` }} />
            {theme === "dark" && <div className="sc-card__fade" />}
            <div className="sc-card__topline" style={{ background: colors.accent, opacity: hovered ? 1 : 0.6 }} />
            <div className="sc-card__badges">
                {userRole === "teacher" && isOwner && <div className="sc-badge sc-badge--owner">Yours</div>}
                {!scenario.is_published && <div className="sc-badge sc-badge--draft">Draft</div>}
                {scenario.mode === "narrative" && <div className="sc-badge sc-badge--narrative">Narrative</div>}
            </div>
            <div className="sc-card__content">
                <h3 className="sc-card__title" style={{ color: titleColor }}>{scenario.title}</h3>
                <div className="sc-card__meta">
                    {diff && (
                        <span className="sc-meta-item" style={{ color: diff.color }}>
                            <span className="sc-meta-dot" style={{ background: diff.color }} />
                            {diff.label}
                        </span>
                    )}
                    {time && <span className="sc-meta-item" style={{ color: metaColor }}>⏱ {time}</span>}
                    {scenario.attempt_count > 0 && <span className="sc-meta-item" style={{ color: metaColor }}>{scenario.attempt_count} attempts</span>}
                </div>
            </div>
        </div>
    );
}

// ─── StudentsTab (unchanged) ──────────────────────────────────────────────────
function StudentsTab({ scenarioId, accentColor }) {
    const [students, setStudents] = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [search,   setSearch]   = useState("");
    const token = getToken();
    useEffect(() => {
        fetch(API(`/scenarios/${scenarioId}/students`), { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.json())
            .then((data) => { setStudents(Array.isArray(data) ? data : []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [scenarioId, token]);
    const filtered = students.filter((s) =>
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase())
    );
    if (loading) return <div className="sc-placeholder">Loading…</div>;
    return (
        <div className="sc-enrol">
            <input className="sc-enrol__search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students…" />
            {filtered.length === 0 ? (
                <div className="sc-placeholder">No students enrolled in this class yet.</div>
            ) : (
                <div className="sc-enrol__list">
                    {filtered.map((s) => (
                        <div key={s.id} className="sc-enrol__row">
                            <div>
                                <div className="sc-enrol__name">{s.first_name} {s.last_name}</div>
                                <div className="sc-enrol__email">{s.email}</div>
                            </div>
                            <span className="sc-enrol__status" style={{ color: accentColor }}>Enrolled</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── ScenarioModal ────────────────────────────────────────────────────────────
function ScenarioModal({ scenario, userId, userRole, onClose, onEdit, onPublishToggle, navigate }) {
    const [activeTab,    setActiveTab]    = useState("overview");
    const [publishing,   setPublishing]   = useState(false);
    const [existingAttempt, setExistingAttempt] = useState(null); // { attempt_id, phase_index, started_at }
    const [checkingAttempt, setCheckingAttempt] = useState(userRole === "student" && scenario.is_published);
    const [abandoning,   setAbandoning]   = useState(false);
    const token     = getToken();
    const isOwner   = scenario.created_by === userId;
    const diff      = DIFFICULTY_CONFIG[scenario.difficulty];
    const accent    = scenario.accentColor;
    const time      = formatTime(scenario.estimated_time_minutes);

    // Check for existing active attempt when modal opens (students only)
    useEffect(() => {
        if (userRole !== "student" || !scenario.is_published) return;
        fetch(API(`/attempts/check/${scenario.id}`), {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.json())
            .then(data => {
                if (data.exists) setExistingAttempt(data);
            })
            .catch(() => {})
            .finally(() => setCheckingAttempt(false));
    }, [scenario.id, userRole, scenario.is_published, token]);

    const handlePublishToggle = async () => {
        setPublishing(true);
        try {
            const res = await fetch(API(`/scenarios/${scenario.id}/publish`), {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ is_published: true }),
            });
            if (!res.ok) throw new Error();
            const { is_published } = await res.json();
            onPublishToggle(scenario.id, is_published);
        } catch {} finally { setPublishing(false); }
    };

    const handleResume = () => {
        navigate(`/simulatorpage/${scenario.id}`);
    };

    const handleStartNew = async () => {
        if (!existingAttempt) { navigate(`/simulatorpage/${scenario.id}`); return; }
        setAbandoning(true);
        try {
            await fetch(API(`/attempts/${existingAttempt.attempt_id}`), {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch {}
        setAbandoning(false);
        navigate(`/simulatorpage/${scenario.id}`);
    };

    const tabs = userRole === "teacher" && isOwner ? ["overview", "students", "analytics"] : ["overview"];

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    // Format started_at for display
    const startedStr = existingAttempt?.started_at
        ? new Date(existingAttempt.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : null;

    return (
        <div className="sc-modal-backdrop" onClick={onClose}>
            <div className="sc-modal" style={{ borderColor: `${accent}33` }} onClick={(e) => e.stopPropagation()}>
                <div className="sc-modal__bar" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}44)` }} />
                <div className="sc-modal__hero" style={{ background: `radial-gradient(ellipse at 90% 0%, ${accent}18 0%, transparent 60%)` }}>
                    <div className="sc-modal__hero-top">
                        <div className="sc-modal__hero-left">
                            <div className="sc-modal__badges">
                                {diff && <span className="sc-tag" style={{ background: `${accent}18`, borderColor: `${accent}33`, color: accent }}>{diff.label}</span>}
                                {!scenario.is_published && <span className="sc-tag sc-tag--draft">Draft</span>}
                                {scenario.mode === "narrative" && <span className="sc-tag" style={{ background: "#7b2fff18", borderColor: "#7b2fff33", color: "#7b2fff" }}>Narrative</span>}
                            </div>
                            <h2 className="sc-modal__title">{scenario.title}</h2>
                            {scenario.class_name && <div className="sc-modal__class">{scenario.class_name}</div>}
                        </div>
                        <button className="sc-modal__close" onClick={onClose}>✕</button>
                    </div>
                    <div className="sc-modal__stats">
                        {diff && <div className="sc-stat"><div className="sc-stat__label">Difficulty</div><div className="sc-stat__value" style={{ color: diff.color }}>{diff.label}</div></div>}
                        {time && <div className="sc-stat"><div className="sc-stat__label">Est. Time</div><div className="sc-stat__value">{time}</div></div>}
                        {scenario.attempt_count >= 0 && <div className="sc-stat"><div className="sc-stat__label">Attempts</div><div className="sc-stat__value">{scenario.attempt_count ?? 0}</div></div>}
                    </div>
                    {tabs.length > 1 && (
                        <div className="sc-modal__tabs">
                            {tabs.map((tab) => (
                                <button key={tab}
                                    className={`sc-modal__tab${activeTab === tab ? " sc-modal__tab--active" : ""}`}
                                    style={activeTab === tab ? { background: `${accent}22`, borderColor: `${accent}44`, color: accent } : {}}
                                    onClick={() => setActiveTab(tab)}>
                                    {tab}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="sc-modal__body">
                    {activeTab === "overview" && (
                        <>
                            {scenario.description && <p className="sc-modal__desc">{scenario.description}</p>}
                            <div className="sc-modal__actions">
                                {userRole === "student" && scenario.is_published && (
                                    checkingAttempt ? (
                                        <div className="sc-attempt-checking">Checking progress…</div>
                                    ) : existingAttempt ? (
                                        <div className="sc-attempt-resume">
                                            <div className="sc-attempt-resume__info">
                                                <span className="sc-attempt-resume__icon">⏱</span>
                                                <div>
                                                    <div className="sc-attempt-resume__label">In progress</div>
                                                    {startedStr && <div className="sc-attempt-resume__date">Started {startedStr}</div>}
                                                </div>
                                            </div>
                                            <div className="sc-attempt-resume__btns">
                                                <button className="sc-btn sc-btn--primary"
                                                    style={{ background: accent, boxShadow: `0 4px 20px ${accent}44` }}
                                                    onClick={handleResume}>
                                                    Resume Scenario →
                                                </button>
                                                <button className="sc-btn sc-btn--ghost sc-btn--danger"
                                                    onClick={handleStartNew} disabled={abandoning}>
                                                    {abandoning ? "Starting…" : "Start New Attempt"}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button className="sc-btn sc-btn--primary"
                                            style={{ background: accent, boxShadow: `0 4px 20px ${accent}44` }}
                                            onClick={() => navigate(`/simulatorpage/${scenario.id}`)}>
                                            Start Scenario →
                                        </button>
                                    )
                                )}
                                {userRole === "teacher" && isOwner && (
                                    <>
                                        <button className="sc-btn sc-btn--primary"
                                            style={{ background: accent, boxShadow: `0 4px 20px ${accent}44` }}
                                            onClick={() => onEdit(scenario)}>
                                            Edit Scenario
                                        </button>
                                        {!scenario.is_published && (
                                            <button className="sc-btn sc-btn--ghost" onClick={handlePublishToggle} disabled={publishing}>
                                                {publishing ? "Publishing…" : "Publish"}
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </>
                    )}
                    {activeTab === "students" && <StudentsTab scenarioId={scenario.id} accentColor={accent} />}
                    {activeTab === "analytics" && <div className="sc-placeholder">Analytics coming soon</div>}
                </div>
            </div>
        </div>
    );
}

// ─── SectionLabel (unchanged) ─────────────────────────────────────────────────
function SectionLabel({ label, count }) {
    return (
        <div className="sc-section-label">
            <span className="sc-section-label__text">{label}</span>
            <span className="sc-section-label__count">{count}</span>
            <div className="sc-section-label__line" />
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Scenarios() {
    const navigate = useNavigate();
    const user     = getUser();
    const userId   = user?.id;
    const userRole = user?.role || "student";
    const token    = getToken();

    const [scenarios,      setScenarios]      = useState([]);
    const [loading,        setLoading]        = useState(true);
    const [error,          setError]          = useState(null);
    const [selected,       setSelected]       = useState(null);
    const [filter,         setFilter]         = useState("all");
    const [showJoin,       setShowJoin]       = useState(false);
    const [showModePicker, setShowModePicker] = useState(false); // ← new
    const [selectedClass,  setSelectedClass]  = useState("all");
    const [classes,        setClasses]        = useState([]);

    const FILTERS = ["all", "easy", "medium", "hard"];

    const uniqueClasses = useMemo(() => {
        if (userRole === "teacher") return [...new Set(classes.map((c) => c.name).filter(Boolean))];
        const names = scenarios.flatMap((s) => s.class_names || []);
        return [...new Set(names)];
    }, [classes, scenarios, userRole]);

    const fetchScenarios = useCallback(() => {
        setLoading(true);
        fetch(API("/scenarios"), { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => { if (!r.ok) throw new Error("Failed to load scenarios"); return r.json(); })
            .then((data) => { setScenarios(data); setLoading(false); })
            .catch((err) => { setError(err.message); setLoading(false); });
    }, [token]);

    const fetchClasses = useCallback(() => {
        fetch(API("/classes"), { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.ok ? r.json() : [])
            .then((data) => setClasses(Array.isArray(data) ? data : []))
            .catch(() => setClasses([]));
    }, [token]);

    useEffect(() => { fetchScenarios(); fetchClasses(); }, [fetchScenarios, fetchClasses]);

    // For teachers: filters apply only to their own scenarios.
    // For students:  filters apply to all visible scenarios.
    const myScenarios = userRole === "teacher"
        ? scenarios.filter((s) => {
            if (s.created_by !== userId) return false;
            if (filter !== "all" && s.difficulty !== filter) return false;
            if (selectedClass !== "all" && !(s.class_names || []).includes(selectedClass)) return false;
            return true;
          })
        : [];

    // Students only: difficulty + class filter on their assigned scenarios
    const classFiltered = userRole === "student"
        ? scenarios.filter((s) => {
            if (filter !== "all" && s.difficulty !== filter) return false;
            if (selectedClass !== "all" && !(s.class_names || []).includes(selectedClass)) return false;
            return true;
          })
        : [];

    const handleEdit = (scenario) => navigate(`/edit-scenario/${scenario.id}`);

    const handlePublishToggle = (scenarioId, newPublishedState) => {
        setScenarios((prev) => prev.map((s) => s.id === scenarioId ? { ...s, is_published: newPublishedState } : s));
        setSelected((prev) => prev?.id === scenarioId ? { ...prev, is_published: newPublishedState } : prev);
    };

    // ← Teacher picks a mode, we navigate with ?mode=... query param
    const handleModePick = (mode) => {
        setShowModePicker(false);
        navigate(`/create-scenario?mode=${mode}`);
    };

    return (
        <>
            <Navbar />
            <div className="sc-page">
                <div className="sc-header">
                    <div className="sc-header__left">
                        <h1 className="sc-header__title">Scenarios</h1>
                    </div>
                    <div className="sc-header__right">
                        <div className="sc-filter-group">
                            {FILTERS.map((f) => (
                                <button key={f}
                                    className={`sc-filter-btn${filter === f ? " sc-filter-btn--active" : ""}`}
                                    onClick={() => setFilter(f)}>{f}</button>
                            ))}
                        </div>
                        {uniqueClasses.length > 0 && (
                            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="sc-class-select">
                                <option value="all">All Classes</option>
                                {uniqueClasses.map((cls) => <option key={cls} value={cls}>{cls}</option>)}
                            </select>
                        )}
                        {userRole === "teacher" && (
                            // ↓ opens mode picker instead of navigating directly
                            <button className="sc-btn sc-btn--create" onClick={() => setShowModePicker(true)}>
                                + Create Scenario
                            </button>
                        )}
                        {userRole === "student" && (
                            <button className="sc-btn sc-btn--join" onClick={() => setShowJoin(true)}>+ Join Class</button>
                        )}
                    </div>
                </div>

                {loading && <div className="sc-placeholder">Loading scenarios…</div>}
                {error   && <div className="sc-error">{error}</div>}

                {!loading && !error && (
                    <>
                        {userRole === "teacher" && myScenarios.length > 0 && (
                            <section className="sc-section sc-section--delay1">
                                <SectionLabel label="Your Scenarios" count={myScenarios.length} />
                                <div className="sc-grid">
                                    {myScenarios.map((s) => (
                                        <ScenarioCard key={s.id} scenario={s} userId={userId} userRole={userRole} onClick={setSelected} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Students: their assigned scenarios */}
                        {userRole === "student" && (
                            <section className="sc-section sc-section--delay2">
                                <SectionLabel label="Your Scenarios" count={classFiltered.length} />
                                {classFiltered.length > 0 ? (
                                    <div className="sc-grid">
                                        {classFiltered.map((s) => (
                                            <ScenarioCard key={s.id} scenario={s} userId={userId} userRole={userRole} onClick={setSelected} />
                                        ))}
                                    </div>
                                ) : (
                                    selectedClass !== "all" ? (
                                        <div className="sc-placeholder">No scenarios in this class.</div>
                                    ) : (
                                        <div className="sc-student-empty">
                                            <div className="sc-student-empty__icon">⬡</div>
                                            <div className="sc-student-empty__title">No scenarios yet</div>
                                            <p className="sc-student-empty__desc">
                                                Join a class using the enrolment code your teacher gave you to unlock your scenarios.
                                            </p>
                                            <button
                                                className="sc-btn sc-btn--primary"
                                                style={{ background: "#4cc9f0", color: "#000", boxShadow: "0 4px 20px #4cc9f044" }}
                                                onClick={() => setShowJoin(true)}
                                            >
                                                + Join a Class
                                            </button>
                                        </div>
                                    )
                                )}
                            </section>
                        )}

                        {/* Teachers: empty state if no own scenarios */}
                        {userRole === "teacher" && myScenarios.length === 0 && (
                            <section className="sc-section sc-section--delay2">
                                <div className="sc-placeholder">
                                    No scenarios yet.{" "}
                                    <span
                                        style={{ color: "var(--color-cyan)", cursor: "pointer" }}
                                        onClick={() => navigate("/create-scenario")}
                                    >
                                        Create your first scenario →
                                    </span>
                                </div>
                            </section>
                        )}
                    </>
                )}
            </div>

            {selected && (
                <ScenarioModal
                    scenario={selected} userId={userId} userRole={userRole}
                    onClose={() => setSelected(null)} onEdit={handleEdit}
                    onPublishToggle={handlePublishToggle} navigate={navigate}
                />
            )}
            {showJoin && (
                <JoinClassModal onClose={() => setShowJoin(false)} onJoined={() => { setShowJoin(false); fetchScenarios(); fetchClasses(); }} />
            )}
            {showModePicker && (
                <ModePickerModal onClose={() => setShowModePicker(false)} onPick={handleModePick} />
            )}
        </>
    );
}