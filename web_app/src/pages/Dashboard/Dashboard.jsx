import React from "react";
import { useNavigate } from "react-router-dom";
import { getUser, logout } from "../../utils/auth";
import "./Dashboard.css";

export default function Dashboard() {
    const navigate = useNavigate();
    const user = getUser();

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Welcome to DFIR Simulation Platform</h1>
                <div className="user-info">
                    <span>Hello, {user?.firstName || 'User'} {user?.lastName || ''}</span>
                    <span className="role-badge">{user?.role || 'student'}</span>
                    <button onClick={handleLogout} className="logout-btn">Logout</button>
                </div>
            </div>
            <div className="dashboard-content">
                <p>Email: {user?.email || 'N/A'}</p>
                <p>Role: {user?.role || 'student'}</p>
            </div>
        </div>
    );
}


