import React from "react";

export default function QuestionRow({ question, index, onUpdate, onRemove }) {
    return (
        <div className="cs-item-row">
            <div className="cs-item-row__header">
                <span className="cs-item-row__number">Question {index + 1}</span>
                <button type="button" className="cs-icon-btn cs-icon-btn--danger"
                    onClick={onRemove} title="Remove question">×</button>
            </div>

            <div className="cs-field">
                <label className="cs-label">Question Text</label>
                <textarea className="cs-input cs-textarea" value={question.question_text} rows={2}
                    onChange={(e) => onUpdate({ ...question, question_text: e.target.value })}
                    placeholder="e.g. What was the user doing on this date?" />
            </div>

            <div className="cs-row-2col">
                <div className="cs-field">
                    <label className="cs-label">Type</label>
                    <select className="cs-input" value={question.question_type}
                        onChange={(e) => onUpdate({ ...question, question_type: e.target.value })}>
                        <option value="phase_question">Phase Question</option>
                        <option value="end_of_scenario">End-of-scenario</option>
                    </select>
                </div>
                <label className="cs-checkbox-row">
                    <input type="checkbox" className="cs-checkbox"
                        checked={question.blocks_progression}
                        onChange={(e) => onUpdate({ ...question, blocks_progression: e.target.checked })} />
                    <span className="cs-checkbox-label">Blocks progression</span>
                </label>
            </div>
        </div>
    );
}
