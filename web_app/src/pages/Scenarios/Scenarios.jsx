import React from "react";
import Navbar from "../../components/Navbar";
import { getUser } from "../../utils/auth";
import "./Scenarios.css";

export default function Scenarios() {
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
                            <p>Scenarios Page</p>
                        </div>
                        <div className="page-content">
                            <p>This is the Scenarios page for a <strong>{userRole}</strong>.</p>
                            {userRole === 'student' && (
                                <div className="role-specific-content">
                                    <h3>Available Scenarios</h3>
                                    <p>Students can view and participate in assigned scenarios here.</p>
                                </div>
                            )}
                            {userRole === 'teacher' && (
                                <div className="role-specific-content">
                                    <h3>Scenario Management</h3>
                                    <p>Teachers can manage and create scenarios here.</p>
                                </div>
                            )}
                            {userRole === 'admin' && (
                                <div className="role-specific-content">
                                    <h3>Scenario Administration</h3>
                                    <p>Administrators can manage all scenarios and platform-wide settings.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
