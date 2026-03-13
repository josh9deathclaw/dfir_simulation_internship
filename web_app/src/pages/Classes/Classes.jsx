import React, { useState, useEffect, useCallback } from "react";
import Navbar from "../../components/Navbar";
import { getUser, getToken } from "../../utils/auth";
import "./Classes.css";

function formatDate(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("en-AU", {
        day: "numeric", month: "short", year: "numeric",
    });
}

function CreateClassModal({ onClose, onCreated }) {
    const [name,    setName]    = useState("");
    const [error,   setError]   = useState("");
    const [loading, setLoading] = useState(false);
    const token = getToken();

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const handleCreate = async () => {
        if (!name.trim()) { setError("Class name is required."); return; }
        setLoading(true);
        setError("");

        try {
            const res = await fetch(`${process.env.REACT_APP_API_URL}/api/classes`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ name: name.trim() }),
            });

            const data = await res.json();
            if (!res.ok) { setError(data.message || "Failed to create class"); return; }
            onCreated(data);
            onClose();
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="cl-backdrop" onClick={onClose}>
            <div className="cl-modal" onClick={(e) => e.stopPropagation()}>
                <div className="cl-modal__header">
                    <h3 className="cl-modal__title">New Class</h3>
                    <button className="cl-modal__close" onClick={onClose}>✕</button>
                </div>

                <div className="cl-modal__body">
                    <div className="cl-field-group">
                        <label className="cl-label">Class Name <span className="cl-required">*</span></label>
                        <input
                            className="cl-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. DFIR 2025 — Semester 1"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                        />
                        <span className="cl-hint">An enrolment code will be generated automatically for students to join.</span>
                    </div>

                    {error && <div className="cl-error">{error}</div>}
                </div>

                <div className="cl-modal__footer">
                    <button className="cl-btn cl-btn--ghost" onClick={onClose}>Cancel</button>
                    <button
                        className="cl-btn cl-btn--primary"
                        onClick={handleCreate}
                        disabled={loading}
                    >
                        {loading ? "Creating…" : "Create Class"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function AddStudentRow({ classId, onAdded }) {
    const [email,   setEmail]   = useState("");
    const [error,   setError]   = useState("");
    const [loading, setLoading] = useState(false);
    const token = getToken();

    const handleAdd = async () => {
        if (!email.trim()) { setError("Enter an email address."); return; }
        setLoading(true);
        setError("");

        try {
            const res = await fetch(
                `${process.env.REACT_APP_API_URL}/api/classes/${classId}/students`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ email: email.trim() }),
                }
            );

            const data = await res.json();
            if (!res.ok) { setError(data.message || "Failed to add student"); return; }
            setEmail("");
            onAdded(data);
        } catch {
            setError("Network error.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="cl-add-student">
            <div className="cl-add-student__row">
                <input
                    className="cl-input cl-input--sm"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    placeholder="Student email address"
                    onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
                <button
                    className="cl-btn cl-btn--primary cl-btn--sm"
                    onClick={handleAdd}
                    disabled={loading}
                >
                    {loading ? "Adding…" : "Add Student"}
                </button>
            </div>
            {error && <div className="cl-error cl-error--sm">{error}</div>}
        </div>
    );
}

function ClassDetail({ cls, onClose, onStudentChange }) {
    const [students,      setStudents]      = useState([]);
    const [loadingDetail, setLoadingDetail] = useState(true);
    const [search,        setSearch]        = useState("");
    const [removing,      setRemoving]      = useState(null);
    const [copied,        setCopied]        = useState(false);
    const token = getToken();

    const loadDetail = useCallback(async () => {
        setLoadingDetail(true);
        try {
            const res = await fetch(
                `${process.env.REACT_APP_API_URL}/api/classes/${cls.id}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await res.json();
            setStudents(data.students || []);
        } catch {}
        finally { setLoadingDetail(false); }
    }, [cls.id, token]);

    useEffect(() => { loadDetail(); }, [loadDetail]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const handleStudentAdded = (student) => {
        setStudents((prev) => [...prev, { ...student, enrolled_at: new Date().toISOString() }]);
        onStudentChange(cls.id, students.length + 1);
    };

    const handleRemove = async (studentId) => {
        setRemoving(studentId);
        try {
            await fetch(
                `${process.env.REACT_APP_API_URL}/api/classes/${cls.id}/students/${studentId}`,
                { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
            );
            setStudents((prev) => prev.filter((s) => s.id !== studentId));
            onStudentChange(cls.id, students.length - 1);
        } catch {}
        finally { setRemoving(null); }
    };

    const copyCode = () => {
        navigator.clipboard.writeText(cls.enrolment_code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const filtered = students.filter((s) =>
        `${s.first_name} ${s.last_name} ${s.email}`.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="cl-backdrop" onClick={onClose}>
            <div className="cl-detail-panel" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="cl-detail__header">
                    <div>
                        <div className="cl-detail__eyebrow">Class</div>
                        <h2 className="cl-detail__title">{cls.name}</h2>
                    </div>
                    <button className="cl-modal__close" onClick={onClose}>✕</button>
                </div>

                {/* Enrolment code */}
                <div className="cl-code-block">
                    <div className="cl-code-block__left">
                        <div className="cl-code-block__label">Student Enrolment Code</div>
                        <div className="cl-code-block__code">{cls.enrolment_code}</div>
                        <div className="cl-code-block__hint">Share this code with students so they can join the class.</div>
                    </div>
                    <button className="cl-copy-btn" onClick={copyCode}>
                        {copied ? "Copied ✓" : "Copy"}
                    </button>
                </div>

                {/* Meta */}
                <div className="cl-detail__meta">
                    <span>Created {formatDate(cls.created_at)}</span>
                    <span>·</span>
                    <span>{students.length} student{students.length !== 1 ? "s" : ""}</span>
                </div>

                {/* Add student */}
                <div className="cl-detail__section">
                    <div className="cl-detail__section-title">Add Student</div>
                    <AddStudentRow classId={cls.id} onAdded={handleStudentAdded} />
                </div>

                {/* Student list */}
                <div className="cl-detail__section cl-detail__section--grow">
                    <div className="cl-detail__section-header">
                        <div className="cl-detail__section-title">
                            Enrolled Students
                        </div>
                        {students.length > 4 && (
                            <input
                                className="cl-input cl-input--sm cl-search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search…"
                            />
                        )}
                    </div>

                    {loadingDetail ? (
                        <div className="cl-placeholder">Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div className="cl-placeholder">
                            {students.length === 0
                                ? "No students enrolled yet. Add them by email above, or share the enrolment code."
                                : "No students match your search."}
                        </div>
                    ) : (
                        <div className="cl-student-list">
                            {filtered.map((s) => (
                                <div key={s.id} className="cl-student-row">
                                    <div className="cl-student-avatar">
                                        {s.first_name[0]}{s.last_name[0]}
                                    </div>
                                    <div className="cl-student-info">
                                        <div className="cl-student-name">
                                            {s.first_name} {s.last_name}
                                        </div>
                                        <div className="cl-student-email">{s.email}</div>
                                    </div>
                                    <div className="cl-student-meta">
                                        <div className="cl-student-date">
                                            Joined {formatDate(s.enrolled_at)}
                                        </div>
                                        <button
                                            className="cl-remove-btn"
                                            onClick={() => handleRemove(s.id)}
                                            disabled={removing === s.id}
                                        >
                                            {removing === s.id ? "…" : "Remove"}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


function ClassCard({ cls, onClick }) {
    const [hovered, setHovered] = useState(false);

    return (
        <div
            className={`cl-card${hovered ? " cl-card--hovered" : ""}`}
            onClick={() => onClick(cls)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div className="cl-card__top">
                <div className="cl-card__icon">
                    {cls.name.charAt(0).toUpperCase()}
                </div>
                <div className="cl-card__badge">{cls.student_count} students</div>
            </div>

            <div className="cl-card__name">{cls.name}</div>
            <div className="cl-card__meta">
                <span className="cl-card__code">{cls.enrolment_code}</span>
                <span className="cl-card__date">Created {formatDate(cls.created_at)}</span>
            </div>
        </div>
    );
}

export default function Classes() {
    const user     = getUser();
    const userRole = user?.role || "student";
    const token    = getToken();

    const [classes,       setClasses]       = useState([]);
    const [loading,       setLoading]       = useState(true);
    const [error,         setError]         = useState(null);
    const [showCreate,    setShowCreate]     = useState(false);
    const [selectedClass, setSelectedClass] = useState(null);

    useEffect(() => {
        fetch(`${process.env.REACT_APP_API_URL}/api/classes`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => {
                if (!r.ok) throw new Error("Failed to load classes");
                return r.json();
            })
            .then((data) => { setClasses(data); setLoading(false); })
            .catch((err) => { setError(err.message); setLoading(false); });
    }, [token]);

    const handleClassCreated = (newClass) => {
        setClasses((prev) => [{ ...newClass, student_count: 0 }, ...prev]);
    };

    const handleStudentChange = (classId, newCount) => {
        setClasses((prev) =>
            prev.map((c) => c.id === classId ? { ...c, student_count: newCount } : c)
        );
    };

    // Students don't manage classes — redirect or show message
    if (userRole === "student") {
        return (
            <>
                <Navbar />
                <div className="cl-page">
                    <div className="cl-placeholder" style={{ paddingTop: 80 }}>
                        Classes are managed by your teacher.
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Navbar />

            <div className="cl-page">
                {/* Header */}
                <div className="cl-header">
                    <div>
                        <div className="cl-header__eyebrow">Instructor Portal</div>
                        <h1 className="cl-header__title">Classes</h1>
                    </div>
                    <button
                        className="cl-btn cl-btn--primary"
                        onClick={() => setShowCreate(true)}
                    >
                        + New Class
                    </button>
                </div>

                {/* States */}
                {loading && <div className="cl-placeholder">Loading classes…</div>}
                {error   && <div className="cl-error">{error}</div>}

                {!loading && !error && classes.length === 0 && (
                    <div className="cl-empty">
                        <div className="cl-empty__icon">◻</div>
                        <div className="cl-empty__title">No classes yet</div>
                        <div className="cl-empty__desc">
                            Create your first class to start enrolling students and assigning scenarios.
                        </div>
                        <button
                            className="cl-btn cl-btn--primary"
                            onClick={() => setShowCreate(true)}
                        >
                            + New Class
                        </button>
                    </div>
                )}

                {!loading && !error && classes.length > 0 && (
                    <div className="cl-grid">
                        {classes.map((cls) => (
                            <ClassCard
                                key={cls.id}
                                cls={cls}
                                onClick={setSelectedClass}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Create modal */}
            {showCreate && (
                <CreateClassModal
                    onClose={() => setShowCreate(false)}
                    onCreated={handleClassCreated}
                />
            )}

            {/* Class detail panel */}
            {selectedClass && (
                <ClassDetail
                    cls={selectedClass}
                    onClose={() => setSelectedClass(null)}
                    onStudentChange={handleStudentChange}
                />
            )}
        </>
    );
}