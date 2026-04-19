// src/pages/createscenario/CreateScenario.jsx
import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { getToken } from "../../utils/auth";
import { API } from "../../utils/api";

import {
    STEPS, uid, newPhase,
    EditorSidebar, StepDetails, StepScenario, StepReview,
    validate, buildPayload,
} from "../../components/CreateScenario/CreateEditScenarioLogic.jsx";

import "./CreateScenario.css";

export default function CreateScenario() {
    const navigate        = useNavigate();
    const [searchParams]  = useSearchParams();
    const mode            = searchParams.get("mode") || "open_ended"; // set by ModePickerModal
    const token           = getToken();

    const [currentStep, setCurrentStep] = useState(0);
    const [errors,      setErrors]      = useState([]);
    const [saving,      setSaving]      = useState(false);
    const [classes,     setClasses]     = useState([]);

    const [details, setDetails] = useState({
        title: "", description: "", difficulty: "",
        class_ids: [], estimated_time_minutes: "",
    });
    const [phases,        setPhases]        = useState([]);
    const [scenarioLevel, setScenarioLevel] = useState({ injects: [], objectives: [], questions: [] });

    useEffect(() => {
        fetch(API("/classes"), { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.json())
            .then((data) => setClasses(Array.isArray(data) ? data : []))
            .catch(() => {});
    }, [token]);

    const stepIds = STEPS.map((s) => s.id);

    const goNext = () => {
        const errs = validate(stepIds[currentStep], { details, phases, mode });
        if (errs.length) { setErrors(errs); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
        setErrors([]);
        setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const goBack = () => {
        setErrors([]);
        setCurrentStep((s) => Math.max(s - 1, 0));
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const goToStep = (idx) => {
        if (idx < currentStep) { setErrors([]); setCurrentStep(idx); }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(API("/scenarios"), {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(buildPayload({ details, phases, scenarioLevel, mode })),
            });
            if (!res.ok) throw new Error();
            navigate("/scenarios");
        } catch {
            setErrors(["Failed to save. Please try again."]);
        } finally {
            setSaving(false);
        }
    };

    const isLastStep = currentStep === STEPS.length - 1;

    return (
        <>
            <Navbar />
            <div className="cs-page">
                <EditorSidebar
                    title={`Create Scenario · ${mode === "narrative" ? "Narrative" : "Open-ended"}`}
                    steps={STEPS}
                    currentStep={currentStep}
                    onGoToStep={goToStep}
                    onCancel={() => navigate("/scenarios")}
                />

                <main className="cs-main">
                    <div className="cs-main__inner">
                        {errors.length > 0 && (
                            <div className="cs-error-box">
                                {errors.map((e, i) => <div key={i}>· {e}</div>)}
                            </div>
                        )}

                        {currentStep === 0 && (
                            <StepDetails
                                data={details}
                                onChange={(field, val) => setDetails((d) => ({ ...d, [field]: val }))}
                                classes={classes}
                            />
                        )}
                        {currentStep === 1 && (
                            <StepScenario
                                mode={mode}
                                phases={phases} setPhases={setPhases}
                                scenarioLevel={scenarioLevel} setScenarioLevel={setScenarioLevel}
                            />
                        )}
                        {currentStep === 2 && (
                            <StepReview
                                mode={mode}
                                details={details} phases={phases}
                                scenarioLevel={scenarioLevel} classes={classes}
                                isEdit={false}
                            />
                        )}

                        <div className="cs-footer-nav">
                            <button className="cs-btn cs-btn--ghost" onClick={goBack} disabled={currentStep === 0}>
                                ← Back
                            </button>
                            {isLastStep ? (
                                <button className="cs-btn cs-btn--primary" onClick={handleSave} disabled={saving}>
                                    {saving ? "Saving…" : "Create Scenario"}
                                </button>
                            ) : (
                                <button className="cs-btn cs-btn--primary" onClick={goNext}>
                                    Next →
                                </button>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </>
    );
}