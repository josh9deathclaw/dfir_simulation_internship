import React, { useState, useEffect, useCallback } from "react";
import Navbar from "../../components/Navbar";
import { getUser, getToken } from "../../utils/auth";
import { API } from "../../utils/api";
import "./AdminPanel.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ROLES = ["student", "teacher", "admin"];

const ROLE_COLOURS = {
    student: "var(--color-green)",
    teacher: "var(--color-amber)",
    admin:   "var(--color-cyan)",
};

function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-AU", {
        day: "2-digit", month: "short", year: "numeric",
    });
}

// ─── Create User Modal ────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onCreated, token }) {
    const [form,    setForm]    = useState({ firstName: "", lastName: "", email: "", password: "", role: "student" });
    const [error,   setError]   = useState("");
    const [loading, setLoading] = useState(false);

    const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");

        if (!form.firstName.trim() || !form.lastName.trim()) return setError("First and last name are required.");
        if (!form.email.trim())    return setError("Email is required.");
        if (form.password.length < 6) return setError("Password must be at least 6 characters.");

        setLoading(true);
        try {
            const res  = await fetch(API("/users"), {
                method:  "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body:    JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.message || "Failed to create user."); return; }
            onCreated(data);
            onClose();
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="adm-modal-backdrop" onClick={onClose}>
            <div className="adm-modal" onClick={e => e.stopPropagation()}>
                <div className="adm-modal__header">
                    <span className="adm-modal__title">&gt; CREATE USER</span>
                    <button className="adm-modal__close" onClick={onClose}>[X]</button>
                </div>
                <form className="adm-modal__body" onSubmit={handleSubmit}>
                    {error && <div className="adm-error">{error}</div>}

                    <div className="adm-form-row">
                        <div className="adm-form-group">
                            <label className="adm-label">FIRST NAME</label>
                            <input className="adm-input" value={form.firstName} onChange={e => set("firstName", e.target.value)} placeholder="John" required />
                        </div>
                        <div className="adm-form-group">
                            <label className="adm-label">LAST NAME</label>
                            <input className="adm-input" value={form.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Doe" required />
                        </div>
                    </div>

                    <div className="adm-form-group">
                        <label className="adm-label">EMAIL</label>
                        <input className="adm-input" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="john.doe@university.edu" required />
                    </div>

                    <div className="adm-form-group">
                        <label className="adm-label">PASSWORD</label>
                        <input className="adm-input" type="password" value={form.password} onChange={e => set("password", e.target.value)} placeholder="Min 6 characters" required />
                    </div>

                    <div className="adm-form-group">
                        <label className="adm-label">ROLE</label>
                        <select className="adm-input adm-select" value={form.role} onChange={e => set("role", e.target.value)}>
                            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                        </select>
                    </div>

                    <div className="adm-modal__footer">
                        <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose}>Cancel</button>
                        <button type="submit" className="adm-btn adm-btn--primary" disabled={loading}>
                            {loading ? "Creating..." : "Create User"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────
function ConfirmDeleteModal({ user, onClose, onConfirm, loading }) {
    return (
        <div className="adm-modal-backdrop" onClick={onClose}>
            <div className="adm-modal adm-modal--sm" onClick={e => e.stopPropagation()}>
                <div className="adm-modal__header">
                    <span className="adm-modal__title">&gt; CONFIRM DELETE</span>
                    <button className="adm-modal__close" onClick={onClose}>[X]</button>
                </div>
                <div className="adm-modal__body">
                    <p className="adm-confirm__text">
                        Delete <strong>{user.first_name} {user.last_name}</strong> ({user.email})?
                        This cannot be undone.
                    </p>
                    <div className="adm-modal__footer">
                        <button className="adm-btn adm-btn--ghost" onClick={onClose}>Cancel</button>
                        <button className="adm-btn adm-btn--danger" onClick={onConfirm} disabled={loading}>
                            {loading ? "Deleting..." : "Delete User"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({ user, currentUserId, token, onDeleted, onRoleChanged }) {
    const [role,    setRole]    = useState(user.role);
    const [saving,  setSaving]  = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const isSelf = user.id === currentUserId;

    async function handleRoleChange(newRole) {
        if (newRole === role || isSelf) return;
        setSaving(true);
        try {
            const res  = await fetch(API(`/users/${user.id}/role`), {
                method:  "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body:    JSON.stringify({ role: newRole }),
            });
            const data = await res.json();
            if (res.ok) {
                setRole(data.role);
                onRoleChanged(user.id, data.role);
            }
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        setDeleting(true);
        try {
            const res = await fetch(API(`/users/${user.id}`), {
                method:  "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                onDeleted(user.id);
                setConfirm(false);
            }
        } finally {
            setDeleting(false);
        }
    }

    return (
        <>
            <div className="adm-user-row">
                <div className="adm-user-row__avatar">
                    {user.first_name[0]}{user.last_name[0]}
                </div>
                <div className="adm-user-row__info">
                    <span className="adm-user-row__name">
                        {user.first_name} {user.last_name}
                        {isSelf && <span className="adm-user-row__you"> (you)</span>}
                    </span>
                    <span className="adm-user-row__email">{user.email}</span>
                </div>
                <div className="adm-user-row__meta">
                    <span className="adm-user-row__date">{formatDate(user.created_at)}</span>
                </div>
                <div className="adm-user-row__role">
                    {isSelf ? (
                        <span className="adm-role-badge" style={{ color: ROLE_COLOURS[role], borderColor: ROLE_COLOURS[role] }}>
                            {role}
                        </span>
                    ) : (
                        <select
                            className="adm-role-select"
                            value={role}
                            onChange={e => handleRoleChange(e.target.value)}
                            disabled={saving}
                            style={{ color: ROLE_COLOURS[role] }}
                        >
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    )}
                    {saving && <span className="adm-saving">saving…</span>}
                </div>
                <div className="adm-user-row__actions">
                    {!isSelf && (
                        <button
                            className="adm-btn adm-btn--danger-sm"
                            onClick={() => setConfirm(true)}
                            title="Delete user"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {confirm && (
                <ConfirmDeleteModal
                    user={user}
                    onClose={() => setConfirm(false)}
                    onConfirm={handleDelete}
                    loading={deleting}
                />
            )}
        </>
    );
}

// ─── User Management Section ──────────────────────────────────────────────────
function UserManagement({ token, currentUserId }) {
    const [users,       setUsers]       = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState(null);
    const [search,      setSearch]      = useState("");
    const [showCreate,  setShowCreate]  = useState(false);
    const [total,       setTotal]       = useState(0);

    const fetchUsers = useCallback(async (q = "") => {
        setLoading(true);
        setError(null);
        try {
            const res  = await fetch(API(`/users?search=${encodeURIComponent(q)}`), {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setUsers(data.users);
            setTotal(data.total);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => fetchUsers(search), 350);
        return () => clearTimeout(t);
    }, [search, fetchUsers]);

    function handleDeleted(id) {
        setUsers(prev => prev.filter(u => u.id !== id));
        setTotal(t => t - 1);
    }

    function handleRoleChanged(id, newRole) {
        setUsers(prev => prev.map(u => u.id === id ? { ...u, role: newRole } : u));
    }

    function handleCreated(newUser) {
        setUsers(prev => [newUser, ...prev]);
        setTotal(t => t + 1);
    }

    return (
        <div className="adm-section">
            <div className="adm-section__header">
                <div className="adm-section__title-row">
                    <h2 className="adm-section__title">// USER MANAGEMENT</h2>
                    <span className="adm-section__count">{total} users</span>
                </div>
                <div className="adm-section__controls">
                    <input
                        className="adm-search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name or email…"
                    />
                    <button
                        className="adm-btn adm-btn--primary"
                        onClick={() => setShowCreate(true)}
                    >
                        + Create User
                    </button>
                </div>
            </div>

            {loading && (
                <div className="adm-placeholder">Loading users<span className="adm-blink">_</span></div>
            )}
            {error && (
                <div className="adm-error">&gt; ERROR: {error}</div>
            )}

            {!loading && !error && (
                <>
                    <div className="adm-user-table-header">
                        <span>USER</span>
                        <span>JOINED</span>
                        <span>ROLE</span>
                        <span></span>
                    </div>
                    <div className="adm-user-list">
                        {users.length === 0 ? (
                            <div className="adm-placeholder">No users found.</div>
                        ) : (
                            users.map(u => (
                                <UserRow
                                    key={u.id}
                                    user={u}
                                    currentUserId={currentUserId}
                                    token={token}
                                    onDeleted={handleDeleted}
                                    onRoleChanged={handleRoleChanged}
                                />
                            ))
                        )}
                    </div>
                </>
            )}

            {showCreate && (
                <CreateUserModal
                    token={token}
                    onClose={() => setShowCreate(false)}
                    onCreated={handleCreated}
                />
            )}
        </div>
    );
}

// ─── Placeholder Section ──────────────────────────────────────────────────────
function PlaceholderSection({ title, description }) {
    return (
        <div className="adm-section adm-section--placeholder">
            <h2 className="adm-section__title">{title}</h2>
            <p className="adm-placeholder-desc">{description}</p>
        </div>
    );
}

// ─── Main AdminPanel ──────────────────────────────────────────────────────────
export default function AdminPanel() {
    const user     = getUser();
    const token    = getToken();

    return (
        <>
            <Navbar />
            <div className="page-container">
                <div className="page-wrapper">
                    <div className="page-card">
                        <div className="page-header">
                            <h1>Admin</h1>
                            <p>Platform Administration</p>
                        </div>
                        <div className="page-content">
                            <UserManagement token={token} currentUserId={user?.id} />

                            <PlaceholderSection
                                title="// SYSTEM CONFIGURATION"
                                description="Platform-wide configuration settings. Coming soon."
                            />

                            <PlaceholderSection
                                title="// SECURITY SETTINGS"
                                description="Access controls, rate limiting, and security policies. Coming soon."
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}