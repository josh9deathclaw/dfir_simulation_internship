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

            <div className="cs-field" style={{ maxWidth: 180 }}>
                <label className="cs-label">Max Score (pts)</label>
                <input className="cs-input" type="number" min={1} max={1000}
                    value={question.max_score}
                    onChange={(e) => onUpdate({ ...question, max_score: parseFloat(e.target.value) || 10 })}
                    placeholder="e.g. 10" />
            </div>
        </div>
    );
}