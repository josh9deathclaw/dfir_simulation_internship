import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactFlow, {
    useNodesState,
    useEdgesState,
    addEdge,
    Background,
    Controls,
    MiniMap,
    BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";

import EvidenceCardNode from "./EvidenceCardNode";
import "./InvestigationBoard.css";

// ── Register custom node types (defined OUTSIDE the component to be stable) ──
const NODE_TYPES = { evidenceCard: EvidenceCardNode };

// ── Default edge style: glowing red thread ────────────────────────────────────
const DEFAULT_EDGE_OPTIONS = {
    type: "smoothstep",
    style: {
        stroke: "#ff003c",
        strokeWidth: 2,
        filter: "drop-shadow(0 0 5px #ff003c) drop-shadow(0 0 10px rgba(255,0,60,0.5))",
    },
    animated: false,
};

// ── Scatter nodes across the canvas with some padding ─────────────────────────
function buildInitialNodes(receivedInjects, onAnnotate) {
    const COLS     = 4;
    const CELL_W   = 280;
    const CELL_H   = 220;
    const OFFSET_X = 80;
    const OFFSET_Y = 60;

    return receivedInjects.map((inject, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);

        // Add jitter so cards don't line up perfectly
        const jitterX = Math.random() * 60 - 30;
        const jitterY = Math.random() * 40 - 20;

        return {
            id:       String(inject.id),
            type:     "evidenceCard",
            position: {
                x: OFFSET_X + col * CELL_W + jitterX,
                y: OFFSET_Y + row * CELL_H + jitterY,
            },
            data: {
                inject,
                annotation: "",
                onAnnotate,
            },
        };
    });
}

// ── LocalStorage helpers ──────────────────────────────────────────────────────
function lsKey(attemptId, suffix) {
    return `dfir_board_${suffix}_${attemptId}`;
}

function loadFromStorage(attemptId) {
    try {
        const rawNodes       = localStorage.getItem(lsKey(attemptId, "nodes"));
        const rawAnnotations = localStorage.getItem(lsKey(attemptId, "annotations"));
        const rawEdges       = localStorage.getItem(lsKey(attemptId, "edges"));
        return {
            savedNodes:       rawNodes       ? JSON.parse(rawNodes)       : null,
            savedAnnotations: rawAnnotations ? JSON.parse(rawAnnotations) : {},
            savedEdges:       rawEdges       ? JSON.parse(rawEdges)       : [],
        };
    } catch {
        return { savedNodes: null, savedAnnotations: {}, savedEdges: [] };
    }
}

function saveNodesToStorage(attemptId, nodes) {
    try {
        // Only persist id, type, position — not the callback functions in data
        const slim = nodes.map(n => ({
            id:       n.id,
            type:     n.type,
            position: n.position,
        }));
        localStorage.setItem(lsKey(attemptId, "nodes"), JSON.stringify(slim));
    } catch {}
}

function saveEdgesToStorage(attemptId, edges) {
    try {
        localStorage.setItem(lsKey(attemptId, "edges"), JSON.stringify(edges));
    } catch {}
}

function saveAnnotationsToStorage(attemptId, annotations) {
    try {
        localStorage.setItem(lsKey(attemptId, "annotations"), JSON.stringify(annotations));
    } catch {}
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function InvestigationBoard({ receivedInjects, attemptId, onClose }) {

    // ── Annotation modal state ─────────────────────────────────────────────────
    const [annotationModal, setAnnotationModal] = useState({ open: false, nodeId: null });
    const [annotationDraft, setAnnotationDraft] = useState("");
    const [annotations,     setAnnotations]     = useState({});

    // ── React Flow state ───────────────────────────────────────────────────────
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // ── Debounce timer refs ────────────────────────────────────────────────────
    const saveNodesTimer       = useRef(null);
    const saveAnnotationsTimer = useRef(null);

    // ── Open annotation modal ─────────────────────────────────────────────────
    const handleAnnotate = useCallback((nodeId) => {
        setAnnotationModal({ open: true, nodeId });
        setAnnotationDraft(prev => {
            // Read from current annotations state via functional update pattern
            return "";  // set below via effect
        });
    }, []);

    // Seed draft when modal opens
    useEffect(() => {
        if (annotationModal.open && annotationModal.nodeId) {
            setAnnotationDraft(annotations[annotationModal.nodeId] || "");
        }
    }, [annotationModal.open, annotationModal.nodeId, annotations]);

    // ── Save annotation ────────────────────────────────────────────────────────
    const handleSaveAnnotation = useCallback(() => {
        const { nodeId } = annotationModal;
        if (!nodeId) return;

        const updated = { ...annotations, [nodeId]: annotationDraft };
        setAnnotations(updated);

        // Patch the annotation into the node's data so the card updates live
        setNodes(nds =>
            nds.map(n =>
                n.id === nodeId
                    ? { ...n, data: { ...n.data, annotation: annotationDraft } }
                    : n
            )
        );

        // Persist
        clearTimeout(saveAnnotationsTimer.current);
        saveAnnotationsTimer.current = setTimeout(() => {
            saveAnnotationsToStorage(attemptId, updated);
        }, 300);

        setAnnotationModal({ open: false, nodeId: null });
        setAnnotationDraft("");
    }, [annotationModal, annotationDraft, annotations, attemptId, setNodes]);

    // ── Cancel annotation modal ────────────────────────────────────────────────
    const handleCancelAnnotation = useCallback(() => {
        setAnnotationModal({ open: false, nodeId: null });
        setAnnotationDraft("");
    }, []);

    // ── Build nodes on mount, restoring positions if saved ────────────────────
    useEffect(() => {
        if (!attemptId || receivedInjects.length === 0) return;

        const { savedNodes, savedAnnotations, savedEdges } = loadFromStorage(attemptId);

        // Restore annotations
        setAnnotations(savedAnnotations);

        // Restore edges
        if (savedEdges.length > 0) {
            setEdges(savedEdges.map(e => ({
                ...e,
                style: DEFAULT_EDGE_OPTIONS.style,
            })));
        }

        if (savedNodes && savedNodes.length > 0) {
            // Merge saved positions with current inject data
            // New injects (not in saved) get fresh random positions
            const posMap = Object.fromEntries(savedNodes.map(n => [n.id, n.position]));

            const merged = receivedInjects.map((inject, i) => {
                const id = String(inject.id);
                const position = posMap[id] || {
                    x: 80 + (i % 4) * 280 + Math.random() * 60 - 30,
                    y: 60 + Math.floor(i / 4) * 220 + Math.random() * 40 - 20,
                };
                return {
                    id,
                    type: "evidenceCard",
                    position,
                    data: {
                        inject,
                        annotation: savedAnnotations[id] || "",
                        onAnnotate: handleAnnotate,
                    },
                };
            });
            setNodes(merged);
        } else {
            // Fresh layout
            setNodes(buildInitialNodes(receivedInjects, handleAnnotate));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attemptId, receivedInjects.length]);

    // ── Keep onAnnotate callback fresh on all nodes ────────────────────────────
    // (avoids stale closure issues if handleAnnotate reference changes)
    useEffect(() => {
        setNodes(nds =>
            nds.map(n => ({
                ...n,
                data: { ...n.data, onAnnotate: handleAnnotate },
            }))
        );
    }, [handleAnnotate, setNodes]);

    // ── Connect two nodes with a red thread ───────────────────────────────────
    const handleConnect = useCallback((connection) => {
        setEdges(eds => {
            const next = addEdge(
                {
                    ...connection,
                    ...DEFAULT_EDGE_OPTIONS,
                    id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
                },
                eds
            );
            clearTimeout(saveNodesTimer.current);
            saveNodesTimer.current = setTimeout(() => {
                saveEdgesToStorage(attemptId, next);
            }, 300);
            return next;
        });
    }, [attemptId, setEdges]);

    // ── Persist node positions on drag stop ───────────────────────────────────
    const handleNodeDragStop = useCallback((_, __, draggedNodes) => {
        clearTimeout(saveNodesTimer.current);
        saveNodesTimer.current = setTimeout(() => {
            setNodes(current => {
                saveNodesToStorage(attemptId, current);
                return current;
            });
        }, 300);
    }, [attemptId, setNodes]);

    // ── Derived ───────────────────────────────────────────────────────────────
    const annotatedNode = annotationModal.nodeId
        ? receivedInjects.find(inj => String(inj.id) === annotationModal.nodeId)
        : null;

    const connectionCount = edges.length;
    const annotationCount = Object.values(annotations).filter(a => a.trim()).length;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="ib-overlay">
            <div className="ib-container">

                {/* ── Header ── */}
                <div className="ib-header">
                    <div className="ib-header__left">
                        <span className="ib-header__prompt">&gt;&gt;</span>
                        <span className="ib-header__title">INVESTIGATION_BOARD</span>
                        <span className="ib-header__blink">_</span>
                    </div>
                    <div className="ib-header__stats">
                        <span className="ib-stat">
                            <span className="ib-stat__num">{receivedInjects.length}</span>
                            <span className="ib-stat__label">EVIDENCE</span>
                        </span>
                        <span className="ib-stat__sep">|</span>
                        <span className="ib-stat">
                            <span className="ib-stat__num">{connectionCount}</span>
                            <span className="ib-stat__label">THREADS</span>
                        </span>
                        <span className="ib-stat__sep">|</span>
                        <span className="ib-stat">
                            <span className="ib-stat__num">{annotationCount}</span>
                            <span className="ib-stat__label">ANNOTATIONS</span>
                        </span>
                    </div>
                    <button className="ib-header__close" onClick={onClose}>
                        [ X ]
                    </button>
                </div>

                {/* ── Canvas ── */}
                <div className="ib-canvas">
                    {receivedInjects.length === 0 ? (
                        <div className="ib-empty">
                            <div className="ib-empty__icon">◈</div>
                            <div className="ib-empty__title">NO EVIDENCE RECEIVED</div>
                            <div className="ib-empty__sub">
                                Evidence will appear here as transmissions are received
                            </div>
                        </div>
                    ) : (
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={handleConnect}
                            onNodeDragStop={handleNodeDragStop}
                            nodeTypes={NODE_TYPES}
                            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
                            fitView
                            fitViewOptions={{ padding: 0.2 }}
                            minZoom={0.2}
                            maxZoom={2}
                            deleteKeyCode="Delete"
                            proOptions={{ hideAttribution: true }}
                        >
                            <Background
                                variant={BackgroundVariant.Dots}
                                gap={24}
                                size={1}
                                color="rgba(255,0,60,0.12)"
                            />
                            <Controls
                                className="ib-controls"
                                showInteractive={false}
                            />
                            <MiniMap
                                className="ib-minimap"
                                nodeColor={() => "rgba(255,0,60,0.6)"}
                                maskColor="rgba(3,7,16,0.85)"
                                style={{ background: "rgba(3,7,16,0.9)", border: "1px solid rgba(255,0,60,0.3)" }}
                            />
                        </ReactFlow>
                    )}
                </div>

                {/* ── Hint bar ── */}
                <div className="ib-hints">
                    <span className="ib-hint">DRAG CARDS TO REPOSITION</span>
                    <span className="ib-hint__sep">·</span>
                    <span className="ib-hint">DRAG FROM ◼ HANDLES TO CONNECT</span>
                    <span className="ib-hint__sep">·</span>
                    <span className="ib-hint">DEL KEY REMOVES SELECTED THREAD</span>
                    <span className="ib-hint__sep">·</span>
                    <span className="ib-hint">SCROLL TO ZOOM</span>
                </div>
            </div>

            {/* ── Annotation Modal ── */}
            {annotationModal.open && (
                <div className="ib-anno-backdrop" onClick={handleCancelAnnotation}>
                    <div className="ib-anno-modal" onClick={e => e.stopPropagation()}>
                        <div className="ib-anno-modal__header">
                            <span className="ib-anno-modal__prompt">&gt; ANNOTATION</span>
                            {annotatedNode && (
                                <span className="ib-anno-modal__subject">
                                    — {annotatedNode.title}
                                </span>
                            )}
                        </div>
                        <textarea
                            className="ib-anno-modal__textarea"
                            value={annotationDraft}
                            onChange={e => setAnnotationDraft(e.target.value)}
                            placeholder="> enter analyst notes..."
                            rows={6}
                            autoFocus
                        />
                        <div className="ib-anno-modal__footer">
                            <button
                                className="ib-anno-btn ib-anno-btn--cancel"
                                onClick={handleCancelAnnotation}
                            >
                                [ CANCEL ]
                            </button>
                            <button
                                className="ib-anno-btn ib-anno-btn--save"
                                onClick={handleSaveAnnotation}
                            >
                                [ SAVE NOTE ]
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}