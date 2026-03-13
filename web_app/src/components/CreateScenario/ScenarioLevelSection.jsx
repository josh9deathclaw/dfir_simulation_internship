import React, { useState } from "react";
import InjectRow from "./InjectRow";
import ObjectiveRow from "./ObjectiveRow";
import QuestionRow from "./QuestionRow";

export default function ScenarioLevelSection({ data, onChange }) {
    const [expanded, setExpanded] = useState(true);

    const addInject = () => {
        const newInject = {
            _id: Math.random().toString(36).slice(2, 10),
            title: "",
            description: "",
            file_name: "",
            file_type: "",
            file_size: null,
            file_path: "",
            file_obj: null,
            upload_status: "idle",
            release_type: "random_in_phase",
            min_delay_minutes: 0,
            max_delay_minutes: 10,
            guaranteed_release_minutes: "",
            notify_student: true,
        };
        onChange({ ...data, injects: [...data.injects, newInject] });
    };

    const updateInject = (idx, updated) => {
        const newInjects = data.injects.map((i, j) => j === idx ? updated : i);
        onChange({ ...data, injects: newInjects });
    };

    const removeInject = (idx) => {
        const newInjects = data.injects.filter((_, j) => j !== idx);
        onChange({ ...data, injects: newInjects });
    };

    const addObjective = () => {
        const newObjective = {
            _id: Math.random().toString(36).slice(2, 10),
            description: "",
            objective_type: "main",
            blocks_progression: false,
        };
        onChange({ ...data, objectives: [...data.objectives, newObjective] });
    };

    const updateObjective = (idx, updated) => {
        const newObjectives = data.objectives.map((o, j) => j === idx ? updated : o);
        onChange({ ...data, objectives: newObjectives });
    };

    const removeObjective = (idx) => {
        const newObjectives = data.objectives.filter((_, j) => j !== idx);
        onChange({ ...data, objectives: newObjectives });
    };

    const addQuestion = () => {
        const newQuestion = {
            _id: Math.random().toString(36).slice(2, 10),
            question_text: "",
            blocks_progression: false,
            question_type: "end_scenario_question",
        };
        onChange({ ...data, questions: [...data.questions, newQuestion] });
    };

    const updateQuestion = (idx, updated) => {
        const newQuestions = data.questions.map((q, j) => j === idx ? updated : q);
        onChange({ ...data, questions: newQuestions });
    };

    const removeQuestion = (idx) => {
        const newQuestions = data.questions.filter((_, j) => j !== idx);
        onChange({ ...data, questions: newQuestions });
    };

    return (
        <div className="cs-scenario-level-section">
            <div className="cs-scenario-level-header" onClick={() => setExpanded(!expanded)}>
                <div className="cs-toggle">{expanded ? "▼" : "▶"}</div>
                <h3>Scenario-Level Content</h3>
                <span className="cs-hint">(Free-roaming injects & end-of-scenario questions)</span>
            </div>

            {expanded && (
                <div className="cs-scenario-level-body">
                    <div className="cs-section-divider">Free-Roaming Injects</div>
                    <div className="cs-item-list">
                        {data.injects.map((inject, idx) => (
                            <InjectRow key={inject._id} inject={inject} index={idx}
                                onUpdate={(updated) => updateInject(idx, updated)}
                                onRemove={() => removeInject(idx)} />
                        ))}
                    </div>
                    <button className="cs-add-btn" onClick={addInject}>+ Add Free-Roaming Inject</button>

                    <div className="cs-section-divider">Scenario Objectives</div>
                    <div className="cs-item-list">
                        {data.objectives.map((objective, idx) => (
                            <ObjectiveRow key={objective._id} objective={objective} index={idx}
                                onUpdate={(updated) => updateObjective(idx, updated)}
                                onRemove={() => removeObjective(idx)} />
                        ))}
                    </div>
                    <button className="cs-add-btn" onClick={addObjective}>+ Add Scenario Objective</button>

                    <div className="cs-section-divider">End-of-Scenario Questions</div>
                    <div className="cs-item-list">
                        {data.questions.map((question, idx) => (
                            <QuestionRow key={question._id} question={question} index={idx}
                                onUpdate={(updated) => updateQuestion(idx, updated)}
                                onRemove={() => removeQuestion(idx)} />
                        ))}
                    </div>
                    <button className="cs-add-btn" onClick={addQuestion}>+ Add End Question</button>
                </div>
            )}
        </div>
    );
}
