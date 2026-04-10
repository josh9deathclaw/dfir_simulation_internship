import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { getUser, getToken } from "../../utils/auth";
import { API } from "../../utils/api";
import "./Dashboard.css";

// ─── Teacher Dashboard ────────────────────────────────────────────────────────
function TeacherDashboard({ token }) {
    const navigate = useNavigate();
    const [pending, setPending] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(API("/dashboard/pending"), {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
                setPending(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [token]);

    return (
        <div className="db-section">
            <div className="db-section__header">
                <span className="db-section__label">// PENDING GRADING</span>
                {pending.length > 0 && (
                    <span className="db-section__badge db-section__badge--alert">
                        {pending.length}
                    </span>
                )}
            </div>

            {loading ? (
                <div className="db-empty">
                    <span className="db-empty__text">Scanning submissions<span className="db-blink">_</span></span>
                </div>
            ) : pending.length === 0 ? (
                <div className="db-empty">
                    <span className="db-empty__icon">◈</span>
                    <span className="db-empty__text">All caught up — no submissions awaiting review.</span>
                </div>
            ) : (
                <div className="db-list">
                    {pending.slice(0, 6).map((attempt) => (
                        <div
                            key={attempt.id}
                            className="db-row db-row--clickable"
                            onClick={() => navigate("/grading")}
                        >
                            <div className="db-row__left">
                                <div className="db-row__title">{attempt.scenario_title}</div>
                                <div className="db-row__sub">
                                    {attempt.student_name}{attempt.class_name ? ` · ${attempt.class_name}` : ""}
                                </div>
                            </div>
                            <span className="db-row__tag db-row__tag--pending">Review →</span>
                        </div>
                    ))}
                    {pending.length > 6 && (
                        <button className="db-show-more" onClick={() => navigate("/grading")}>
                            View all {pending.length} pending →
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Student Dashboard ────────────────────────────────────────────────────────
function StudentDashboard({ token }) {
    const navigate = useNavigate();
    const [newestScenario, setNewestScenario] = useState(null);
    const [latestAttempt,  setLatestAttempt]  = useState(null);
    const [loading,        setLoading]        = useState(true);

    useEffect(() => {
        fetch(API("/dashboard/summary"), {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => (r.ok ? r.json() : {}))
            .then((data) => {
                setNewestScenario(data.newestScenario || null);
                setLatestAttempt(data.latestAttempt   || null);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [token]);

    if (loading) {
        return (
            <div className="db-empty">
                <span className="db-empty__text">Loading<span className="db-blink">_</span></span>
            </div>
        );
    }

    return (
        <>
            <div className="db-section">
                <div className="db-section__header">
                    <span className="db-section__label">// LATEST SCENARIO</span>
                </div>
                {newestScenario ? (
                    <div
                        className="db-row db-row--clickable db-row--featured"
                        onClick={() => navigate("/scenarios")}
                    >
                        <div className="db-row__left">
                            <div className="db-row__title">{newestScenario.title}</div>
                            <div className="db-row__sub">
                                {newestScenario.class_name || "General"}
                                {newestScenario.difficulty ? ` · ${newestScenario.difficulty.charAt(0).toUpperCase() + newestScenario.difficulty.slice(1)}` : ""}
                                {newestScenario.estimated_time_minutes ? ` · ${newestScenario.estimated_time_minutes}m` : ""}
                            </div>
                        </div>
                        <span className="db-row__tag db-row__tag--go">Open →</span>
                    </div>
                ) : (
                    <div className="db-empty">
                        <span className="db-empty__icon">⬡</span>
                        <span className="db-empty__text">No scenarios assigned yet. Join a class to get started.</span>
                    </div>
                )}
            </div>

            <div className="db-section">
                <div className="db-section__header">
                    <span className="db-section__label">// LATEST ATTEMPT</span>
                </div>
                {latestAttempt ? (
                    <div className="db-row">
                        <div className="db-row__left">
                            <div className="db-row__title">{latestAttempt.scenario_title}</div>
                            <div className="db-row__sub">
                                Completed {latestAttempt.completed_at
                                    ? new Date(latestAttempt.completed_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                                    : "—"}
                            </div>
                        </div>
                        {latestAttempt.score !== null ? (
                            <span className="db-row__score">
                                {latestAttempt.score}
                                <span className="db-row__score-denom">/{latestAttempt.max_score || "?"}</span>
                            </span>
                        ) : (
                            <span className="db-row__tag db-row__tag--pending">Awaiting grade</span>
                        )}
                    </div>
                ) : (
                    <div className="db-empty">
                        <span className="db-empty__icon">◇</span>
                        <span className="db-empty__text">No attempts yet. Start a scenario to begin.</span>
                    </div>
                )}
            </div>
        </>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
    const user     = getUser();
    const token    = getToken();
    const userRole = user?.role || "student";
    const roleLabel = { student: "Student", teacher: "Instructor", admin: "Administrator" }[userRole] || userRole;

    return (
        <>
            <Navbar />
            <div className="page-container">
                <div className="page-wrapper">
                    <div className="page-card">
                        <div className="page-header">
                            <h1>Welcome back, {user?.firstName || roleLabel}</h1>
                            <p>DFIR Simulation Platform · {roleLabel}</p>
                        </div>
                        <div className="page-content">
                            {userRole === "teacher" && <TeacherDashboard token={token} />}
                            {userRole === "student" && <StudentDashboard token={token} />}
                            {userRole === "admin" && (
                                <div className="db-section">
                                    <div className="db-section__header">
                                        <span className="db-section__label">// ADMIN PANEL</span>
                                    </div>
                                    <div className="db-empty">
                                        <span className="db-empty__icon">⊙</span>
                                        <span className="db-empty__text">Full platform access enabled. Use the navigation tabs to manage users, classes, and scenarios.</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}