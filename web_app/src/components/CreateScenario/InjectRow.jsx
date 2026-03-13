import React from "react";
import FileUploadZone from "./FileUploadZone";

export default function InjectRow({ inject, index, onUpdate, onRemove }) {
    return (
        <div className="cs-item-row">
            <div className="cs-item-row__header">
                <span className="cs-item-row__number">Inject {index + 1}</span>
                <button type="button" className="cs-icon-btn cs-icon-btn--danger"
                    onClick={onRemove} title="Remove inject">×</button>
            </div>

            <div className="cs-field">
                <label className="cs-label">Title</label>
                <input className="cs-input" type="text" value={inject.title}
                    onChange={(e) => onUpdate({ ...inject, title: e.target.value })}
                    placeholder="e.g. Evidence Drive" />
            </div>

            <div className="cs-field">
                <label className="cs-label">Description</label>
                <textarea className="cs-input cs-textarea" value={inject.description} rows={2}
                    onChange={(e) => onUpdate({ ...inject, description: e.target.value })}
                    placeholder="Describe what the student receives…" />
            </div>

            <FileUploadZone inject={inject} onUpdate={onUpdate} />

            <div className="cs-field">
                <label className="cs-label">Release Type</label>
                <select className="cs-input" value={inject.release_type}
                    onChange={(e) => onUpdate({ ...inject, release_type: e.target.value })}>
                    <option value="random_in_phase">Random within phase</option>
                    <option value="guaranteed">Guaranteed at time</option>
                </select>
            </div>

            {inject.release_type === "random_in_phase" && (
                <div className="cs-row-2col">
                    <div className="cs-field">
                        <label className="cs-label">Min Delay (min)</label>
                        <input className="cs-input" type="number" min={0}
                            value={inject.min_delay_minutes}
                            onChange={(e) => onUpdate({ ...inject, min_delay_minutes: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div className="cs-field">
                        <label className="cs-label">Max Delay (min)</label>
                        <input className="cs-input" type="number" min={0}
                            value={inject.max_delay_minutes}
                            onChange={(e) => onUpdate({ ...inject, max_delay_minutes: parseInt(e.target.value) || 10 })} />
                    </div>
                </div>
            )}

            {inject.release_type === "guaranteed" && (
                <div className="cs-field">
                    <label className="cs-label">Release at (minutes)</label>
                    <input className="cs-input" type="number" min={0}
                        value={inject.guaranteed_release_minutes}
                        onChange={(e) => onUpdate({ ...inject, guaranteed_release_minutes: parseInt(e.target.value) || "" })} />
                </div>
            )}

            <label className="cs-checkbox-row">
                <input type="checkbox" className="cs-checkbox"
                    checked={inject.notify_student}
                    onChange={(e) => onUpdate({ ...inject, notify_student: e.target.checked })} />
                <span className="cs-checkbox-label">Notify student when received</span>
            </label>
        </div>
    );
}
