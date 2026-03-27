import React from "react";
import Navbar from "../../components/Navbar";
import { getUser } from "../../utils/auth";
import { useTheme } from "../../hooks/useTheme";
import "../../styles/PageStyles.css";
import "./Account.css";

export default function Account() {
    const user = getUser();
    const userRole = user?.role || "student";
    const { isDark, toggleTheme } = useTheme();

    return (
        <>
            <Navbar />
            <div className="page-container">
                <div className="page-wrapper">

                    {/* Account info */}
                    <div className="page-card">
                        <div className="page-header">
                            <h1>
                                <span className="page-header__prompt">&gt;</span>
                                {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                            </h1>
                            <p>Account Page</p>
                        </div>
                        <div className="page-content">
                            <div className="account-info">
                                <h2>Account Information</h2>
                                <p><strong>Name:</strong> {user?.firstName || "N/A"} {user?.lastName || ""}</p>
                                <p><strong>Email:</strong> {user?.email || "N/A"}</p>
                                <p>
                                    <strong>Role:</strong>{" "}
                                    <span className={`role-text role-${userRole}`}>{userRole}</span>
                                </p>
                            </div>

                            {userRole === "student" && (
                                <div className="role-specific-content">
                                    <h3>Student Settings</h3>
                                    <p>Manage your student account settings and preferences here.</p>
                                </div>
                            )}
                            {userRole === "teacher" && (
                                <div className="role-specific-content">
                                    <h3>Teacher Settings</h3>
                                    <p>Access teacher-specific account settings and preferences here.</p>
                                </div>
                            )}
                            {userRole === "admin" && (
                                <div className="role-specific-content">
                                    <h3>Administrator Settings</h3>
                                    <p>Manage administrative account settings and system preferences here.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Theme toggle */}
                    <div className="page-card">
                        <div className="page-header">
                            <h1>
                                <span className="page-header__prompt">&gt;</span>
                                Display
                            </h1>
                            <p>Interface appearance settings</p>
                        </div>
                        <div className="page-content">
                            <div className="account-info">
                                <h2>Theme</h2>
                                <div className="theme-section">
                                    <div className="theme-section__info">
                                        <span className="theme-section__label">
                                            {isDark ? "Dark Mode" : "Light Mode"}
                                        </span>
                                        <span className="theme-section__sub">
                                            {isDark
                                                ? "Terminal — cyberpunk dark theme"
                                                : "Standard — light interface"}
                                        </span>
                                    </div>
                                    <label className="theme-toggle" aria-label="Toggle theme">
                                        <input
                                            type="checkbox"
                                            className="theme-toggle__input"
                                            checked={isDark}
                                            onChange={toggleTheme}
                                        />
                                        <span className="theme-toggle__track" />
                                        <span className="theme-toggle__knob" />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
}