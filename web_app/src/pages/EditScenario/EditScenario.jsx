// src/pages/editscenario/EditScenario.jsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { getToken } from "../../utils/auth";
import { API } from "../../utils/api";
import {
    STEPS,
    EditorSidebar, StepDetails, StepScenario, StepReview,
    validate, buildPayload, mapApiResponseToState,
} from "../../components/CreateScenario/CreateEditScenarioLogic.jsx";
import "../CreateScenario/CreateScenario.css";

export default function EditScenario() {
    const { scenarioId } = useParams();
    const navigate       = useNavigate();
    const token          = getToken();

    const [currentStep, setCurrentStep] = useState(0);
    const [errors,      setErrors]      = useState([]);
    const [saving,      setSaving]      = useState(false);
    const [loadError,   setLoadError]   = useState("");
    const [loading,     setLoading]     = useState(true);
    const [classes,     setClasses]     = useState([]);

    const [mode,          setMode]          = useState("open_ended");
    const [details,       setDetails]       = useState(null);
    const [phases,        setPhases]        = useState([]);
    const [scenarioLevel, setScenarioLevel] = useState({ injects: [], objectives: [], questions: [] });

    useEffect(() => {
        const headers = { Authorization: `Bearer ${token}` };
        Promise.all([
            fetch(API(`/scenarios/${scenarioId}/full`), { headers }),
            fetch(API("/classes"), { headers }),
            fetch(API(`/scenarios/${scenarioId}/classes`), { headers }),
        ])
            .then(async ([scenRes, classRes, scClassRes]) => {
                if (!scenRes.ok) throw new Error("Scenario not found or access denied.");
                const scenData    = await scenRes.json();
                const classData   = classRes.ok ? await classRes.json() : [];
                const scClassData = scClassRes.ok ? await scClassRes.json() : [];

                const { details: d, phases: p, scenarioLevel: sl, mode: m }
                    = mapApiResponseToState(scenData);

                const assignedIds = Array.isArray(scClassData) ? scClassData.map((c) => c.id) : [];
                d.class_ids = assignedIds;

                setMode(m);
                setDetails(d);
                setPhases(p);
                setScenarioLevel(sl);
                setClasses(Array.isArray(classData) ? classData : []);
            })
            .catch((err) => setLoadError(err.message || "Failed to load scenario."))
            .finally(() => setLoading(false));
    }, [scenarioId, token]);

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
            const res = await fetch(API(`/scenarios/${scenarioId}`), {
                method: "PUT",
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

    if (loading) {
        return (<><Navbar /><div className="cs-page"><div className="cs-placeholder">Loading scenario…</div></div></>);
    }

    if (loadError) {
        return (<><Navbar /><div className="cs-page"><div className="cs-error-box">{loadError}</div></div></>);
    }

    return (
        <>
            <Navbar />
            <div className="cs-page">
                <EditorSidebar
                    title={`Edit Scenario · ${mode === "narrative" ? "Narrative" : "Open-ended"}`}
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
                                isEdit={true}
                            />
                        )}

                        <div className="cs-footer-nav">
                            <button className="cs-btn cs-btn--ghost" onClick={goBack} disabled={currentStep === 0}>
                                ← Back
                            </button>
                            {isLastStep ? (
                                <button className="cs-btn cs-btn--primary" onClick={handleSave} disabled={saving}>
                                    {saving ? "Saving…" : "Save Changes"}
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