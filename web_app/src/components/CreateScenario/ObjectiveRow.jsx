export default function ObjectiveRow({ objective, index, onUpdate, onRemove }) {
    const isSide = objective.objective_type === "side";

    return (
        <div className="cs-item-row">
            <div className="cs-item-row__header">
                <span className="cs-item-row__number">Objective {index + 1}</span>
                <button type="button" className="cs-icon-btn cs-icon-btn--danger"
                    onClick={onRemove} title="Remove objective">×</button>
            </div>

            <div className="cs-field">
                <label className="cs-label">Description</label>
                <textarea className="cs-input cs-textarea" value={objective.description} rows={2}
                    onChange={(e) => onUpdate({ ...objective, description: e.target.value })}
                    placeholder={isSide
                        ? "e.g. What date was the NDA breached?"
                        : "e.g. Investigate the user's activity on the suspected date"} />
            </div>

            <div className="cs-row-2col">
                <div className="cs-field">
                    <label className="cs-label">Type</label>
                    <select className="cs-input" value={objective.objective_type}
                        onChange={(e) => onUpdate({ ...objective, objective_type: e.target.value })}>
                        <option value="main">Main</option>
                        <option value="side">Side</option>
                    </select>
                </div>

                {isSide && (
                    <div className="cs-field">
                        <label className="cs-label">Max Score (pts)</label>
                        <input className="cs-input" type="number" min={1} max={1000}
                            value={objective.max_score}
                            onChange={(e) => onUpdate({ ...objective, max_score: parseFloat(e.target.value) || 10 })}
                            placeholder="e.g. 10" />
                    </div>
                )}
            </div>

            {isSide && (
                <>
                    <div className="cs-row-2col">
                        <div className="cs-field">
                            <label className="cs-label">Correct Answer</label>
                            <input className="cs-input" type="text"
                                value={objective.correct_answer}
                                onChange={(e) => onUpdate({ ...objective, correct_answer: e.target.value })}
                                placeholder="Leave blank to disable auto-scoring" />
                        </div>
                        <div className="cs-field">
                            <label className="cs-label">Max Attempts</label>
                            <input className="cs-input" type="number" min={1} max={10}
                                value={objective.max_attempts}
                                onChange={(e) => onUpdate({ ...objective, max_attempts: parseInt(e.target.value) || "" })}
                                placeholder="Leave blank for unlimited" />
                        </div>
                    </div>
                    <span className="cs-hint">
                        Correct answer matching is case-insensitive. Leave blank to skip auto-scoring — teacher grades manually.
                    </span>
                </>
            )}
        </div>
    );
}