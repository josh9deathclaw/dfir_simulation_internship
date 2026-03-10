import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUser, logout } from "../utils/auth";
import { getAllowedTabs } from "../routes";
import "./Navbar.css";

export default function Navbar() {
    const navigate = useNavigate();
    const user = getUser();
    const userRole = user?.role || 'student';

    // Get allowed navigation tabs for this user's role
    const allowedTabs = getAllowedTabs(userRole);

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <nav className="navbar">
            <div className="navbar-container">
                <Link to="/dashboard" className="navbar-logo">
                    DFIR Platform
                </Link>

                <div className="nav-menu">
                    {allowedTabs.map(tab => (
                        <Link
                            key={tab.key}
                            to={tab.path}
                            className="nav-link"
                            title={tab.label}
                        >
                            <span className="nav-icon">{tab.icon}</span>
                            {tab.label}
                        </Link>
                    ))}
                </div>

                <div className="navbar-right">
                    <span className="user-name">{user?.firstName || 'User'}</span>
                    <span className={`role-badge role-${userRole}`}>
                        {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                    </span>
                    <button onClick={handleLogout} className="logout-btn">
                        Logout
                    </button>
                </div>
            </div>
        </nav>
    );
}
