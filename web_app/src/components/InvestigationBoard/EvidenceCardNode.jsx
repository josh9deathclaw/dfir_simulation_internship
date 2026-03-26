import React, { useState } from "react";
import { Handle, Position } from "reactflow";

// ── Colour map (mirrors SimulatorPage's getFileTypeColor) ─────────────────────
const FILE_TYPE_COLOURS = {
    "Network Capture": "#4cc9f0",
    "Log File":        "#52b788",
    "Memory Dump":     "#f4a261",
    "Disk Image":      "#f72585",
    "PDF Document":    "#ffd166",
    "Event Log":       "#52b788",
    "Image":           "#f72585",
};

function getFileTypeColor(type) {
    return FILE_TYPE_COLOURS[type] || "#9d9d9d";
}

// ── Handle component: the glowing + anchor on each side ──────────────────────
function ConnectHandle({ type, position }) {
    return (
        <Handle
            type={type}
            position={position}
            className="ev-handle"
            style={{
                background: "transparent",
                border: "2px solid #ff003c",
                width: 14,
                height: 14,
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 6px #ff003c, 0 0 12px rgba(255,0,60,0.4)",
                cursor: "crosshair",
                zIndex: 10,
            }}
        />
    );
}

// ── Main node component ───────────────────────────────────────────────────────
export default function EvidenceCardNode({ data, id, selected }) {
    const { inject, annotation, onAnnotate } = data;
    const [hovered, setHovered] = useState(false);

    const color       = getFileTypeColor(inject.file_type);
    const displayName = inject.file_name || inject.file_path?.split("/").pop() || null;
    const hasAnnotation = annotation && annotation.trim().length > 0;

    return (
        <div
            className={`ev-card${selected ? " ev-card--selected" : ""}${hovered ? " ev-card--hovered" : ""}`}
            style={{ "--accent": color }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* ── Connection handles on all four sides ── */}
            <ConnectHandle type="target" position={Position.Top} />
            <ConnectHandle type="source" position={Position.Top} />
            <ConnectHandle type="target" position={Position.Bottom} />
            <ConnectHandle type="source" position={Position.Bottom} />
            <ConnectHandle type="target" position={Position.Left} />
            <ConnectHandle type="source" position={Position.Left} />
            <ConnectHandle type="target" position={Position.Right} />
            <ConnectHandle type="source" position={Position.Right} />

            {/* ── Card body ── */}
            <div className="ev-card__inner">
                <div className="ev-card__header">
                    <span
                        className="ev-card__type-badge"
                        style={{ color, borderColor: color }}
                    >
                        {inject.file_type || "FILE"}
                    </span>
                    <span className="ev-card__time">{inject.receivedAt}</span>
                </div>

                <div className="ev-card__title">{inject.title}</div>

                {displayName && (
                    <div className="ev-card__filename">{displayName}</div>
                )}

                {/* ── Annotation preview ── */}
                {hasAnnotation && (
                    <div className="ev-card__annotation-preview">
                        <span className="ev-card__annotation-icon">✎</span>
                        <span className="ev-card__annotation-text">
                            {annotation.length > 60
                                ? annotation.slice(0, 60) + "…"
                                : annotation}
                        </span>
                    </div>
                )}

                {/* ── Annotate button ── */}
                <button
                    className={`ev-card__annotate-btn${hasAnnotation ? " ev-card__annotate-btn--has-note" : ""}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onAnnotate(id);
                    }}
                    title={hasAnnotation ? "Edit annotation" : "Add annotation"}
                >
                    {hasAnnotation ? "✎ EDIT NOTE" : "+ ADD NOTE"}
                </button>
            </div>

            {/* ── Glowing border flash on hover ── */}
            <div className="ev-card__glow" style={{ "--accent": color }} />
        </div>
    );
}