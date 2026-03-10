import React from "react";
import Navbar from "../../components/Navbar";
import { getUser } from "../../utils/auth";
import "./Results.css";

export default function Results() {
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
                            <p>Results Page</p>
                        </div>
                        <div className="page-content">
                            <p>This is the Results page for a <strong>{userRole}</strong>.</p>
                            {userRole === 'student' && (
                                <div className="role-specific-content">
                                    <h3>Your Results</h3>
                                    <p>Students can view their own performance and scenario results here.</p>
                                </div>
                            )}
                            {userRole === 'admin' && (
                                <div className="role-specific-content">
                                    <h3>System Results Overview</h3>
                                    <p>Administrators can view all user results and system-wide analytics.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
