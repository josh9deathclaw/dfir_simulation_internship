import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { getUser, getToken } from "../../utils/auth";
import "./Scenarios.css";
import { API } from "../../utils/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DIFFICULTY_CONFIG = {
    easy:   { label: "Easy",   color: "#52b788" },
    medium: { label: "Medium", color: "#f4a261" },
    hard:   { label: "Hard",   color: "#e63946" },
};

const ACCENT_PALETTE = [
    { accent: "#e63946", cover: "#0f1923" },
    { accent: "#f4a261", cover: "#0d1b2a" },
    { accent: "#7b2fff", cover: "#1a0a2e" },
    { accent: "#52b788", cover: "#0a1f0a" },
    { accent: "#ffd166", cover: "#1a1200" },
    { accent: "#4cc9f0", cover: "#001a2c" },
    { accent: "#f72585", cover: "#1a0011" },
];

function getColorsFromId(id = "") {
    const sum = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return ACCENT_PALETTE[sum % ACCENT_PALETTE.length];
}

function formatTime(mins) {
    if (!mins) return null;
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
}

// ─── Join Class Modal ─────────────────────────────────────────────────────────
function JoinClassModal({ onClose, onJoined }) {
    const [code,    setCode]    = useState("");
    const [error,   setError]   = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(null); // { className }
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

        setLoading(true);
        setError("");

        try {
            const res = await fetch(`${API}/classes/join`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ code: trimmed }),
            });

            const data = await res.json();
            if (!res.ok) { setError(data.message || "Failed to join class."); return; }

            setSuccess({ className: data.class_name });
            onJoined(); // triggers scenario re-fetch in parent
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="sc-modal-backdrop" onClick={onClose}>
            <div
                className="sc-modal sc-modal--join"
                onClick={(e) => e.stopPropagation()}
            >
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
                        // ── Success state ──
                        <div className="sc-join-success">
                            <div className="sc-join-success__icon">✓</div>
                            <div className="sc-join-success__title">Enrolled successfully</div>
                            <div className="sc-join-success__class">{success.className}</div>
                            <p className="sc-join-success__desc">
                                Your scenarios from this class are now available below.
                            </p>
                            <button className="sc-btn sc-btn--primary" style={{ background: "#4cc9f0", color: "#000" }} onClick={onClose}>
                                View Scenarios
                            </button>
                        </div>
                    ) : (
                        // ── Input state ──
                        <>
                            <div className="sc-join-input-wrap">
                                <input
                                    className="sc-join-input"
                                    value={code}
                                    onChange={(e) => {
                                        setCode(e.target.value.toUpperCase().slice(0, 6));
                                        setError("");
                                    }}
                                    placeholder="e.g. XK4F9R"
                                    maxLength={6}
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                                    spellCheck={false}
                                    autoComplete="off"
                                />
                                <div className="sc-join-input__len">{code.length}/6</div>
                            </div>

                            {error && <div className="sc-join-error">{error}</div>}

                            <div className="sc-modal__actions" style={{ marginTop: 20 }}>
                                <button
                                    className="sc-btn sc-btn--primary"
                                    style={{ background: "#4cc9f0", color: "#000", boxShadow: "0 4px 20px #4cc9f044" }}
                                    onClick={handleJoin}
                                    disabled={loading || code.length !== 6}
                                >
                                    {loading ? "Joining…" : "Join Class →"}
                                </button>
                                <button className="sc-btn sc-btn--ghost" onClick={onClose}>
                                    Cancel
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Scenario Card ─────────────────────────────────────────────────────────────
function ScenarioCard({ scenario, userId, userRole, onClick }) {
    const [hovered, setHovered] = useState(false);
    const isOwner = scenario.created_by === userId;
    const diff    = DIFFICULTY_CONFIG[scenario.difficulty];
    const colors  = getColorsFromId(scenario.id);
    const time    = formatTime(scenario.estimated_time_minutes);

    return (
        <div
            className={`sc-card${hovered ? " sc-card--hovered" : ""}`}
            style={{
                background:  colors.cover,
                borderColor: hovered ? `${colors.accent}55` : "rgba(255,255,255,0.06)",
                boxShadow:   hovered
                    ? `0 20px 60px ${colors.accent}30, 0 0 0 1px ${colors.accent}22`
                    : "0 4px 20px rgba(0,0,0,0.4)",
            }}
            onClick={() => onClick({ ...scenario, accentColor: colors.accent })}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div
                className="sc-card__glow"
                style={{
                    background: `radial-gradient(ellipse at 80% 20%, ${colors.accent}22 0%, transparent 60%),
                                 radial-gradient(ellipse at 20% 80%, ${colors.accent}11 0%, transparent 50%)`,
                }}
            />
            <div className="sc-card__fade" />
            <div className="sc-card__topline" style={{ background: colors.accent, opacity: hovered ? 1 : 0.5 }} />

            <div className="sc-card__badges">
                {userRole === "teacher" && isOwner && (
                    <div className="sc-badge sc-badge--owner">Yours</div>
                )}
                {!scenario.is_published && (
                    <div className="sc-badge sc-badge--draft">Draft</div>
                )}
            </div>

            <div className="sc-card__content">
                <h3 className="sc-card__title">{scenario.title}</h3>
                <div className="sc-card__meta">
                    {diff && (
                        <span className="sc-meta-item" style={{ color: diff.color }}>
                            <span className="sc-meta-dot" style={{ background: diff.color }} />
                            {diff.label}
                        </span>
                    )}
                    {time && (
                        <span className="sc-meta-item sc-meta-item--muted">⏱ {time}</span>
                    )}
                    {scenario.attempt_count > 0 && (
                        <span className="sc-meta-item sc-meta-item--muted">
                            {scenario.attempt_count} attempts
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Students Tab (teacher only) ──────────────────────────────────────────────
function StudentsTab({ scenarioId, accentColor }) {
    const [students, setStudents] = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [search,   setSearch]   = useState("");
    const token = getToken();

    useEffect(() => {
        fetch(`${API}/scenarios/${scenarioId}/students`, {
            headers: { Authorization: `Bearer ${token}` },
        })
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
            <input
                className="sc-enrol__search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search students…"
            />
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
                            <span className="sc-enrol__status" style={{ color: accentColor }}>
                                Enrolled
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Scenario Detail Modal ────────────────────────────────────────────────────
function ScenarioModal({ scenario, userId, userRole, onClose, onEdit, onPublishToggle, navigate }) {
    const [activeTab, setActiveTab] = useState("overview");
    const [publishing, setPublishing] = useState(false);
    const token = getToken();
    const isOwner     = scenario.created_by === userId;
    const diff        = DIFFICULTY_CONFIG[scenario.difficulty];
    const accentColor = scenario.accentColor;
    const time        = formatTime(scenario.estimated_time_minutes);

    const handlePublishToggle = async () => {
        setPublishing(true);
        try {
            const res = await fetch(
                `${API}/scenarios/${scenario.id}/publish`,
                { 
                    method: "PATCH", 
                    headers: { 
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}` 
                    },
                    body: JSON.stringify({ is_published: true })
                }
            );
            if (!res.ok) throw new Error();
            const { is_published } = await res.json();
            onPublishToggle(scenario.id, is_published);
        } catch {
            // fail silently — could add an error state here later
        } finally {
            setPublishing(false);
        }
    };

    const tabs = userRole === "teacher" && isOwner
        ? ["overview", "students", "analytics"]
        : ["overview"];

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="sc-modal-backdrop" onClick={onClose}>
            <div
                className="sc-modal"
                style={{ borderColor: `${accentColor}33` }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sc-modal__bar" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}44)` }} />

                <div className="sc-modal__hero" style={{ background: `radial-gradient(ellipse at 90% 0%, ${accentColor}18 0%, transparent 60%)` }}>
                    <div className="sc-modal__hero-top">
                        <div className="sc-modal__hero-left">
                            <div className="sc-modal__badges">
                                {diff && (
                                    <span className="sc-tag" style={{ background: `${accentColor}18`, borderColor: `${accentColor}33`, color: accentColor }}>
                                        {diff.label}
                                    </span>
                                )}
                                {!scenario.is_published && (
                                    <span className="sc-tag sc-tag--draft">Draft</span>
                                )}
                            </div>
                            <h2 className="sc-modal__title">{scenario.title}</h2>
                            {scenario.class_name && (
                                <div className="sc-modal__class">{scenario.class_name}</div>
                            )}
                        </div>
                        <button className="sc-modal__close" onClick={onClose}>✕</button>
                    </div>

                    <div className="sc-modal__stats">
                        {diff && (
                            <div className="sc-stat">
                                <div className="sc-stat__label">Difficulty</div>
                                <div className="sc-stat__value" style={{ color: diff.color }}>{diff.label}</div>
                            </div>
                        )}
                        {time && (
                            <div className="sc-stat">
                                <div className="sc-stat__label">Est. Time</div>
                                <div className="sc-stat__value">{time}</div>
                            </div>
                        )}
                        {scenario.attempt_count >= 0 && (
                            <div className="sc-stat">
                                <div className="sc-stat__label">Attempts</div>
                                <div className="sc-stat__value">{scenario.attempt_count ?? 0}</div>
                            </div>
                        )}
                    </div>

                    {tabs.length > 1 && (
                        <div className="sc-modal__tabs">
                            {tabs.map((tab) => (
                                <button
                                    key={tab}
                                    className={`sc-modal__tab${activeTab === tab ? " sc-modal__tab--active" : ""}`}
                                    style={activeTab === tab ? { background: `${accentColor}22`, borderColor: `${accentColor}44`, color: accentColor } : {}}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="sc-modal__body">
                    {activeTab === "overview" && (
                        <>
                            {scenario.description && (
                                <p className="sc-modal__desc">{scenario.description}</p>
                            )}
                            <div className="sc-modal__actions">
                                {userRole === "student" && scenario.is_published && (
                                    <button
                                        className="sc-btn sc-btn--primary"
                                        style={{ background: accentColor, boxShadow: `0 4px 20px ${accentColor}44` }}
                                        onClick={() => navigate(`/simulatorpage/${scenario.id}`)}
                                    >
                                        Start Scenario →

                                    </button>
                                )}
                                {userRole === "teacher" && isOwner && (
                                    <>
                                        <button
                                            className="sc-btn sc-btn--primary"
                                            style={{ background: accentColor, boxShadow: `0 4px 20px ${accentColor}44` }}
                                            onClick={() => onEdit(scenario)}
                                        >
                                            Edit Scenario
                                        </button>
                                        {!scenario.is_published && (
                                            <button className="sc-btn sc-btn--ghost" 
                                                onClick={handlePublishToggle}
                                                disabled={publishing}   
                                            >
                                                {publishing ? "Publishing…" : "Publish"}
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </>
                    )}
                    {activeTab === "students" && (
                        <StudentsTab scenarioId={scenario.id} accentColor={accentColor} />
                    )}
                    {activeTab === "analytics" && (
                        <div className="sc-placeholder">Analytics coming soon</div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Section Label ────────────────────────────────────────────────────────────
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

    const [scenarios,  setScenarios]  = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState(null);
    const [selected,   setSelected]   = useState(null);
    const [filter,     setFilter]     = useState("all");
    const [showJoin,   setShowJoin]   = useState(false);
    const [selectedClass, setSelectedClass] = useState("all");
    const [classes, setClasses] = useState([]);

    const FILTERS = ["all", "easy", "medium", "hard"];

    const uniqueClasses = useMemo(() => {
        if (userRole === "teacher") {
            return [...new Set(classes.map(c => c.name).filter(Boolean))];
        }
        const names = scenarios.flatMap(s => s.class_names || []);
        return [...new Set(names)];
    }, [classes, scenarios, userRole]);

    const fetchScenarios = useCallback(() => {
        setLoading(true);
        fetch(`${API}/scenarios`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => {
                if (!r.ok) throw new Error("Failed to load scenarios");
                return r.json();
            })
            .then((data) => { setScenarios(data); setLoading(false); })
            .catch((err) => { setError(err.message); setLoading(false); });
    }, [token]);

    const fetchClasses = useCallback(() => {
        fetch(`${API}/classes`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.ok ? r.json() : [])
            .then((data) => { setClasses(Array.isArray(data) ? data : []); })
            .catch(() => { setClasses([]); });
    }, [token]);

    useEffect(() => { 
        fetchScenarios(); 
        fetchClasses();
    }, [fetchScenarios, fetchClasses]);

    const visible = scenarios.filter(
        (s) => filter === "all" || s.difficulty === filter
    );

    const myScenarios        = userRole === "teacher" ? visible.filter((s) => s.created_by === userId) : [];
    const allScenariosSection = visible; // teachers see everything, students see their enrolled+published
    // For teachers "all scenarios" = everything (including their own).
    // For students it's just their visible scenarios.

    const classFiltered = allScenariosSection.filter(
        (s) => selectedClass === "all" || (s.class_names || []).includes(selectedClass)
    );

    const handleEdit = (scenario) => {
        navigate(`/edit-scenario/${scenario.id}`);
    };

    const handlePublishToggle = (scenarioId, newPublishedState) => {
        // Update local state so the card and modal both reflect the change immediately
        setScenarios((prev) =>
            prev.map((s) => s.id === scenarioId ? { ...s, is_published: newPublishedState } : s)
        );
        setSelected((prev) =>
            prev?.id === scenarioId ? { ...prev, is_published: newPublishedState } : prev
        );
    };

    return (
        <>
            <Navbar />

            <div className="sc-page">
                {/* ── Header ── */}
                <div className="sc-header">
                    <div className="sc-header__left">
                        <h1 className="sc-header__title">Scenarios</h1>
                    </div>
                    <div className="sc-header__right">
                        <div className="sc-filter-group">
                            {FILTERS.map((f) => (
                                <button
                                    key={f}
                                    className={`sc-filter-btn${filter === f ? " sc-filter-btn--active" : ""}`}
                                    onClick={() => setFilter(f)}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>

                        {uniqueClasses.length > 0 && (
                            <select 
                                value={selectedClass} 
                                onChange={(e) => setSelectedClass(e.target.value)} 
                                className="sc-class-select"
                            >
                                <option value="all">All Classes</option>
                                {uniqueClasses.map((cls) => (
                                    <option key={cls} value={cls}>{cls}</option>
                                ))}
                            </select>
                        )}

                        {/* Teacher: create button */}
                        {userRole === "teacher" && (
                            <button className="sc-btn sc-btn--create" onClick={() => navigate("/create-scenario")}>
                                + Create Scenario
                            </button>
                        )}

                        {/* Student: join class button */}
                        {userRole === "student" && (
                            <button
                                className="sc-btn sc-btn--join"
                                onClick={() => setShowJoin(true)}
                            >
                                + Join Class
                            </button>
                        )}
                    </div>
                </div>

                {/* ── States ── */}
                {loading && <div className="sc-placeholder">Loading scenarios…</div>}
                {error   && <div className="sc-error">{error}</div>}

                {!loading && !error && (
                    <>
                        {/* Teacher: own scenarios */}
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

                        {/* All other / enrolled scenarios */}
                        <section className="sc-section sc-section--delay2">
                            <SectionLabel
                                label={userRole === "teacher" ? "All Scenarios" : "Your Scenarios"}
                                count={classFiltered.length}
                            />
                            {classFiltered.length > 0 ? (
                                <div className="sc-grid">
                                    {classFiltered.map((s) => (
                                        <ScenarioCard key={s.id} scenario={s} userId={userId} userRole={userRole} onClick={setSelected} />
                                    ))}
                                </div>
                            ) : (
                                /* ── Empty states ── */
                                selectedClass !== "all" ? (
                                    <div className="sc-placeholder">No scenarios in this class.</div>
                                ) : userRole === "student" ? (
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
                                ) : (
                                    <div className="sc-placeholder">No other scenarios exist yet.</div>
                                )
                            )}
                        </section>
                    </>
                )}
            </div>

            {/* ── Modals ── */}
            {selected && (
                <ScenarioModal
                    scenario={selected}
                    userId={userId}
                    userRole={userRole}
                    onClose={() => setSelected(null)}
                    onEdit={handleEdit}
                    onPublishToggle={handlePublishToggle}
                    navigate={navigate}
                />
            )}

            {showJoin && (
                <JoinClassModal
                    onClose={() => setShowJoin(false)}
                    onJoined={() => {
                        setShowJoin(false);
                        fetchScenarios(); // re-fetch so new scenarios appear
                        fetchClasses(); // re-fetch classes to include the new one
                    }}
                />
            )}
        </>
    );
}