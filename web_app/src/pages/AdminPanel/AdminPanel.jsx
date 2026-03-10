import React from "react";
import Navbar from "../../components/Navbar";
import { getUser } from "../../utils/auth";
import "./AdminPanel.css";

export default function AdminPanel() {
    const user = getUser();
    const userRole = user?.role || 'student';

    return (
        <>
            <Navbar />
            <div className="page-container">
                <div className="page-wrapper">
                    <div className="page-card">
                        <div className="page-header">
                            <h1>{userRole.charAt(0).toUpperCase() + userRole.slice(1)}</h1>
                            <p>Admin Panel</p>
                        </div>
                        <div className="page-content">
                            <p>This is the Admin Panel page for a <strong>{userRole}</strong>.</p>
                            {userRole === 'admin' && (
                                <div className="role-specific-content">
                                    <h3>Administrative Controls</h3>
                                    <p>Full system administration and management capabilities.</p>
                                    <div className="admin-tools">
                                        <div className="admin-section">
                                            <h4>User Management</h4>
                                            <p>Manage user accounts, roles, and permissions.</p>
                                        </div>
                                        <div className="admin-section">
                                            <h4>System Configuration</h4>
                                            <p>Configure system settings and platform parameters.</p>
                                        </div>
                                        <div className="admin-section">
                                            <h4>Analytics & Reporting</h4>
                                            <p>View system-wide analytics and generate reports.</p>
                                        </div>
                                        <div className="admin-section">
                                            <h4>Security Settings</h4>
                                            <p>Manage security policies and access controls.</p>
                                        </div>
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
