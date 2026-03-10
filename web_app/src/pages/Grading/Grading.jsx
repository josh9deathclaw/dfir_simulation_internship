import React from "react";
import Navbar from "../../components/Navbar";
import { getUser } from "../../utils/auth";
import "./Grading.css";

export default function Grading() {
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
                            <p>Grading Page</p>
                        </div>
                        <div className="page-content">
                            <p>This is the Grading page for a <strong>{userRole}</strong>.</p>
                            {userRole === 'teacher' && (
                                <div className="role-specific-content">
                                    <h3>Teacher Grading Dashboard</h3>
                                    <p>Review and grade student scenario submissions here.</p>
                                    <div className="grading-tools">
                                        <div className="grading-section">
                                            <h4>Pending Submissions</h4>
                                            <p>View and evaluate student work that needs grading.</p>
                                        </div>
                                        <div className="grading-section">
                                            <h4>Grading Rubrics</h4>
                                            <p>Access predefined grading criteria and standards.</p>
                                        </div>
                                        <div className="grading-section">
                                            <h4>Feedback Tools</h4>
                                            <p>Provide detailed feedback and improvement suggestions.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {userRole === 'admin' && (
                                <div className="role-specific-content">
                                    <h3>Administrative Grading Oversight</h3>
                                    <p>Monitor grading activities and manage grading policies.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
