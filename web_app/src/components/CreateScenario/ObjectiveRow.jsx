export default function ObjectiveRow({ objective, index, onUpdate, onRemove }) {
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
                    placeholder="e.g. Retrieve the user's browsing history" />
            </div>

            <div className="cs-row-2col">
                <div className="cs-field">
                    <label className="cs-label">Type</label>
                    <select className="cs-input" value={objective.objective_type}
                        onChange={(e) => onUpdate({ ...objective, objective_type: e.target.value })}>
                        <option value="main">Main</option>
                        <option value="bonus">Bonus</option>
                        <option value="optional">Optional</option>
                    </select>
                </div>
                <label className="cs-checkbox-row">
                    <input type="checkbox" className="cs-checkbox"
                        checked={objective.blocks_progression}
                        onChange={(e) => onUpdate({ ...objective, blocks_progression: e.target.checked })} />
                    <span className="cs-checkbox-label">Blocks phase progression</span>
                </label>
            </div>
        </div>
    );
}
