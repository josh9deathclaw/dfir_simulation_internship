import React from "react";
import Navbar from "../../components/Navbar";
import { getUser } from "../../utils/auth";
import "./Account.css";

export default function Account() {
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
                            <p>Account Page</p>
                        </div>
                        <div className="page-content">
                            <div className="account-info">
                                <h2>Account Information</h2>
                                <p><strong>Name:</strong> {user?.firstName || 'N/A'} {user?.lastName || ''}</p>
                                <p><strong>Email:</strong> {user?.email || 'N/A'}</p>
                                <p><strong>Role:</strong> <span className={`role-text role-${userRole}`}>{userRole}</span></p>
                            </div>
                            {userRole === 'student' && (
                                <div className="role-specific-content">
                                    <h3>Student Settings</h3>
                                    <p>Manage your student account settings and preferences here.</p>
                                </div>
                            )}
                            {userRole === 'teacher' && (
                                <div className="role-specific-content">
                                    <h3>Teacher Settings</h3>
                                    <p>Access teacher-specific account settings and preferences here.</p>
                                </div>
                            )}
                            {userRole === 'admin' && (
                                <div className="role-specific-content">
                                    <h3>Administrator Settings</h3>
                                    <p>Manage administrative account settings and system preferences here.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
