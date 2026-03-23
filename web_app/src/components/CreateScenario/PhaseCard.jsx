import InjectRow from "./InjectRow";
import QuestionRow from "./QuestionRow";

export default function PhaseCard({ phase, index, total, onUpdate, onRemove, onMove }) {
    const toggleExpanded = () => {
        onUpdate({ ...phase, expanded: !phase.expanded });
    };

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
        onUpdate({ ...phase, injects: [...phase.injects, newInject] });
    };

    const updateInject = (injectIdx, updated) => {
        const newInjects = phase.injects.map((i, idx) => idx === injectIdx ? updated : i);
        onUpdate({ ...phase, injects: newInjects });
    };

    const removeInject = (injectIdx) => {
        const newInjects = phase.injects.filter((_, idx) => idx !== injectIdx);
        onUpdate({ ...phase, injects: newInjects });
    };

    const addQuestion = () => {
        const newQuestion = {
            _id: Math.random().toString(36).slice(2, 10),
            question_text: "",
            blocks_progression: true,
            question_type: "phase_question",
            max_score: 10,
        };
        onUpdate({ ...phase, questions: [...phase.questions, newQuestion] });
    };

    const updateQuestion = (qIdx, updated) => {
        const newQuestions = phase.questions.map((q, idx) => idx === qIdx ? updated : q);
        onUpdate({ ...phase, questions: newQuestions });
    };

    const removeQuestion = (qIdx) => {
        const newQuestions = phase.questions.filter((_, idx) => idx !== qIdx);
        onUpdate({ ...phase, questions: newQuestions });
    };

    return (
        <div className="cs-phase-card">
            <div className="cs-phase-card__header" onClick={toggleExpanded}>
                <div className="cs-phase-card__toggle">
                    {phase.expanded ? "▼" : "▶"}
                </div>
                <div className="cs-phase-card__title">
                    Phase {index + 1}: {phase.title || "Untitled"}
                </div>
                <div className="cs-phase-card__meta">
                    <span className="cs-chip">{phase.duration_minutes}min</span>
                    {phase.requires_completion && <span className="cs-chip cs-chip--gate">Gated</span>}
                </div>
                <div className="cs-phase-card__controls">
                    <button type="button"
                        onClick={(e) => { e.stopPropagation(); onMove(index, -1); }}
                        disabled={index === 0}
                        title="Move up"
                    >↑</button>
                    <button type="button"
                        onClick={(e) => { e.stopPropagation(); onMove(index, 1); }}
                        disabled={index === total - 1}
                        title="Move down"
                    >↓</button>
                    <button type="button"
                        onClick={(e) => { e.stopPropagation(); onRemove(index); }}
                        title="Delete phase"
                        className="cs-icon-btn--danger"
                    >×</button>
                </div>
            </div>

            {phase.expanded && (
                <div className="cs-phase-card__body">
                    <div className="cs-field">
                        <label className="cs-label">Phase Title</label>
                        <input className="cs-input" type="text" value={phase.title}
                            onChange={(e) => onUpdate({ ...phase, title: e.target.value })}
                            placeholder="e.g. Initial Investigation" />
                    </div>

                    <div className="cs-field">
                        <label className="cs-label">Description</label>
                        <textarea className="cs-input cs-textarea" value={phase.description} rows={3}
                            onChange={(e) => onUpdate({ ...phase, description: e.target.value })}
                            placeholder="Describe what happens in this phase…" />
                    </div>

                    <div className="cs-row-2col">
                        <div className="cs-field">
                            <label className="cs-label">Duration (minutes)</label>
                            <input className="cs-input" type="number" min={1} value={phase.duration_minutes}
                                onChange={(e) => onUpdate({ ...phase, duration_minutes: parseInt(e.target.value) || 30 })} />
                        </div>
                        <label className="cs-checkbox-row">
                            <input type="checkbox" className="cs-checkbox"
                                checked={phase.requires_completion}
                                onChange={(e) => onUpdate({ ...phase, requires_completion: e.target.checked })} />
                            <span className="cs-checkbox-label">Requires Completion to Advance</span>
                        </label>
                    </div>

                    <div className="cs-section-divider">Injects</div>
                    <div className="cs-item-list">
                        {phase.injects.map((inject, idx) => (
                            <InjectRow key={inject._id} inject={inject} index={idx}
                                onUpdate={(updated) => updateInject(idx, updated)}
                                onRemove={() => removeInject(idx)} />
                        ))}
                    </div>
                    <button className="cs-add-btn" onClick={addInject}>+ Add Inject</button>

                    <div className="cs-section-divider">Questions</div>
                    <div className="cs-item-list">
                        {phase.questions.map((question, idx) => (
                            <QuestionRow key={question._id} question={question} index={idx}
                                onUpdate={(updated) => updateQuestion(idx, updated)}
                                onRemove={() => removeQuestion(idx)} />
                        ))}
                    </div>
                    <button className="cs-add-btn" onClick={addQuestion}>+ Add Question</button>
                </div>
            )}
        </div>
    );
}