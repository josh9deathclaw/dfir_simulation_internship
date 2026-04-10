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
import { getToken } from "../../utils/auth";
import { API } from "../../utils/api";

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

// ── LocalStorage helpers (write-through cache) ────────────────────────────────
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

function writeToStorage(attemptId, { nodes, edges, annotations }) {
    try {
        if (nodes !== undefined) {
            const slim = nodes.map(n => ({ id: n.id, type: n.type, position: n.position }));
            localStorage.setItem(lsKey(attemptId, "nodes"), JSON.stringify(slim));
        }
        if (edges !== undefined) {
            localStorage.setItem(lsKey(attemptId, "edges"), JSON.stringify(edges));
        }
        if (annotations !== undefined) {
            localStorage.setItem(lsKey(attemptId, "annotations"), JSON.stringify(annotations));
        }
    } catch {}
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function loadBoardFromAPI(attemptId, token) {
    const res = await fetch(API(`/board/${attemptId}`), {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Board load failed");
    return res.json(); // { boardState, injects }
}

async function saveBoardToAPI(attemptId, token, { nodes, edges, annotations }) {
    const slim = nodes.map(n => ({ id: n.id, type: n.type, position: n.position }));
    await fetch(API(`/board/${attemptId}`), {
        method:  "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ nodes: slim, edges, annotations }),
    });
}

// ── Main Component ────────────────────────────────────────────────────────────
// Props:
//   receivedInjects  — array of inject objects (used in student live mode)
//   attemptId        — UUID of the attempt
//   onClose          — close handler
//   readOnly         — if true, board is view-only (teacher mode). Injects are
//                      loaded from the API instead of using receivedInjects.
export default function InvestigationBoard({ receivedInjects = [], attemptId, onClose, readOnly = false }) {
    const token = getToken();

    // ── Annotation modal state ─────────────────────────────────────────────────
    const [annotationModal, setAnnotationModal] = useState({ open: false, nodeId: null });
    const [annotationDraft, setAnnotationDraft] = useState("");
    const [annotations,     setAnnotations]     = useState({});

    // ── React Flow state ───────────────────────────────────────────────────────
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // ── Inject list (may come from API in readOnly mode) ──────────────────────
    const [boardInjects, setBoardInjects] = useState(receivedInjects);
    const [boardLoading, setBoardLoading] = useState(readOnly); // only show loader in readOnly

    // ── Debounce timer refs ────────────────────────────────────────────────────
    const saveTimer = useRef(null);

    // ── Flush board state to API + localStorage ───────────────────────────────
    const flushSave = useCallback((currentNodes, currentEdges, currentAnnotations) => {
        if (readOnly || !attemptId) return;
        writeToStorage(attemptId, { nodes: currentNodes, edges: currentEdges, annotations: currentAnnotations });
        saveBoardToAPI(attemptId, token, {
            nodes: currentNodes,
            edges: currentEdges,
            annotations: currentAnnotations,
        }).catch(err => console.warn("[Board save error]", err));
    }, [attemptId, token, readOnly]);

    // ── Debounced save triggered by any state change ───────────────────────────
    const scheduleSave = useCallback((currentNodes, currentEdges, currentAnnotations) => {
        if (readOnly) return;
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            flushSave(currentNodes, currentEdges, currentAnnotations);
        }, 800);
    }, [flushSave, readOnly]);

    // ── Open annotation modal ─────────────────────────────────────────────────
    const handleAnnotate = useCallback((nodeId) => {
        if (readOnly) return;
        setAnnotationModal({ open: true, nodeId });
    }, [readOnly]);

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

        setNodes(nds => {
            const next = nds.map(n =>
                n.id === nodeId
                    ? { ...n, data: { ...n.data, annotation: annotationDraft } }
                    : n
            );
            scheduleSave(next, edges, updated);
            return next;
        });

        setAnnotationModal({ open: false, nodeId: null });
        setAnnotationDraft("");
    }, [annotationModal, annotationDraft, annotations, edges, scheduleSave, setNodes]);

    const handleCancelAnnotation = useCallback(() => {
        setAnnotationModal({ open: false, nodeId: null });
        setAnnotationDraft("");
    }, []);

    // ── Build nodes from an inject list + saved state ─────────────────────────
    const buildNodes = useCallback((injectList, savedNodes, savedAnnotations) => {
        const posMap = savedNodes
            ? Object.fromEntries(savedNodes.map(n => [n.id, n.position]))
            : {};

        return injectList.map((inject, i) => {
            const savedPos = posMap[String(inject.id)];
            const col = i % 4;
            const row = Math.floor(i / 4);
            const pos = savedPos || {
                x: 80  + col * 280 + (Math.random() * 60 - 30),
                y: 60  + row * 220 + (Math.random() * 40 - 20),
            };

            return {
                id:       String(inject.id),
                type:     "evidenceCard",
                position: pos,
                draggable: !readOnly,
                connectable: !readOnly,
                data: {
                    inject,
                    annotation: savedAnnotations?.[String(inject.id)] || "",
                    onAnnotate: readOnly ? null : handleAnnotate,
                },
            };
        });
    }, [readOnly, handleAnnotate]);

    // ── Load board on mount ───────────────────────────────────────────────────
    useEffect(() => {
        if (!attemptId) return;

        if (readOnly) {
            // Teacher mode: load everything from the API
            setBoardLoading(true);
            loadBoardFromAPI(attemptId, token)
                .then(({ boardState, injects }) => {
                    setBoardInjects(injects);
                    const savedNodes       = boardState?.nodes       || null;
                    const savedAnnotations = boardState?.annotations || {};
                    const savedEdges       = boardState?.edges       || [];

                    setAnnotations(savedAnnotations);

                    if (savedEdges.length > 0) {
                        setEdges(savedEdges.map(e => ({ ...e, style: DEFAULT_EDGE_OPTIONS.style })));
                    }

                    setNodes(buildNodes(injects, savedNodes, savedAnnotations));
                })
                .catch(err => {
                    console.error("[Board load error]", err);
                    setBoardInjects([]);
                })
                .finally(() => setBoardLoading(false));
        } else {
            // Student mode: try API first, fall back to localStorage
            loadBoardFromAPI(attemptId, token)
                .then(({ boardState }) => {
                    if (boardState) {
                        // API has saved state — use it, also warm the localStorage cache
                        const savedAnnotations = boardState.annotations || {};
                        const savedEdges       = boardState.edges       || [];
                        const savedNodes       = boardState.nodes       || null;

                        setAnnotations(savedAnnotations);
                        writeToStorage(attemptId, {
                            nodes:       savedNodes,
                            edges:       savedEdges,
                            annotations: savedAnnotations,
                        });

                        if (savedEdges.length > 0) {
                            setEdges(savedEdges.map(e => ({ ...e, style: DEFAULT_EDGE_OPTIONS.style })));
                        }
                        setNodes(buildNodes(receivedInjects, savedNodes, savedAnnotations));
                    } else {
                        // No API state yet — try localStorage
                        const { savedNodes, savedAnnotations, savedEdges } = loadFromStorage(attemptId);
                        setAnnotations(savedAnnotations);
                        if (savedEdges.length > 0) {
                            setEdges(savedEdges.map(e => ({ ...e, style: DEFAULT_EDGE_OPTIONS.style })));
                        }
                        setNodes(buildNodes(receivedInjects, savedNodes, savedAnnotations));
                    }
                })
                .catch(() => {
                    // API unavailable — fall back to localStorage silently
                    const { savedNodes, savedAnnotations, savedEdges } = loadFromStorage(attemptId);
                    setAnnotations(savedAnnotations);
                    if (savedEdges.length > 0) {
                        setEdges(savedEdges.map(e => ({ ...e, style: DEFAULT_EDGE_OPTIONS.style })));
                    }
                    setNodes(buildNodes(receivedInjects, savedNodes, savedAnnotations));
                });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attemptId, readOnly, receivedInjects.length]);

    // ── Keep onAnnotate callback fresh on all nodes ────────────────────────────
    useEffect(() => {
        setNodes(nds =>
            nds.map(n => ({
                ...n,
                data: { ...n.data, onAnnotate: readOnly ? null : handleAnnotate },
            }))
        );
    }, [handleAnnotate, readOnly, setNodes]);

    // ── Flush to API when board closes ────────────────────────────────────────
    // useEffect cleanup runs on unmount — we grab the latest state via ref
    const latestState = useRef({ nodes: [], edges: [], annotations: {} });
    useEffect(() => {
        latestState.current = { nodes, edges, annotations };
    });

    useEffect(() => {
        return () => {
            if (!readOnly) {
                clearTimeout(saveTimer.current);
                const { nodes: n, edges: e, annotations: a } = latestState.current;
                flushSave(n, e, a);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readOnly]);

    // ── Connect two nodes with a red thread ───────────────────────────────────
    const handleConnect = useCallback((connection) => {
        if (readOnly) return;
        setEdges(eds => {
            const next = addEdge(
                {
                    ...connection,
                    ...DEFAULT_EDGE_OPTIONS,
                    id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
                },
                eds
            );
            setNodes(current => {
                scheduleSave(current, next, annotations);
                return current;
            });
            return next;
        });
    }, [readOnly, setEdges, setNodes, scheduleSave, annotations]);

    // ── Persist node positions on drag stop ───────────────────────────────────
    const handleNodeDragStop = useCallback(() => {
        if (readOnly) return;
        setNodes(current => {
            scheduleSave(current, edges, annotations);
            return current;
        });
    }, [readOnly, setNodes, scheduleSave, edges, annotations]);

    // ── Derived ───────────────────────────────────────────────────────────────
    const annotatedNode    = annotationModal.nodeId
        ? boardInjects.find(inj => String(inj.id) === annotationModal.nodeId)
        : null;
    const connectionCount  = edges.length;
    const annotationCount  = Object.values(annotations).filter(a => a?.trim()).length;
    const displayInjects   = readOnly ? boardInjects : receivedInjects;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="ib-overlay">
            <div className="ib-container">

                {/* ── Header ── */}
                <div className="ib-header">
                    <div className="ib-header__left">
                        <span className="ib-header__prompt">&gt;&gt;</span>
                        <span className="ib-header__title">
                            {readOnly ? "INVESTIGATION_BOARD — READ ONLY" : "INVESTIGATION_BOARD"}
                        </span>
                        {!readOnly && <span className="ib-header__blink">_</span>}
                        {readOnly && (
                            <span className="ib-header__readonly-badge">VIEWER MODE</span>
                        )}
                    </div>
                    <div className="ib-header__stats">
                        <span className="ib-stat">
                            <span className="ib-stat__num">{displayInjects.length}</span>
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
                    {boardLoading ? (
                        <div className="ib-empty">
                            <div className="ib-empty__icon">◈</div>
                            <div className="ib-empty__title">
                                LOADING BOARD<span className="ib-header__blink">_</span>
                            </div>
                        </div>
                    ) : displayInjects.length === 0 ? (
                        <div className="ib-empty">
                            <div className="ib-empty__icon">◈</div>
                            <div className="ib-empty__title">
                                {readOnly ? "NO EVIDENCE WAS RECEIVED" : "NO EVIDENCE RECEIVED"}
                            </div>
                            <div className="ib-empty__sub">
                                {readOnly
                                    ? "The student did not receive any injects during this attempt"
                                    : "Evidence will appear here as transmissions are received"}
                            </div>
                        </div>
                    ) : (
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={readOnly ? undefined : onNodesChange}
                            onEdgesChange={readOnly ? undefined : onEdgesChange}
                            onConnect={readOnly ? undefined : handleConnect}
                            onNodeDragStop={readOnly ? undefined : handleNodeDragStop}
                            nodeTypes={NODE_TYPES}
                            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
                            nodesDraggable={!readOnly}
                            nodesConnectable={!readOnly}
                            elementsSelectable={!readOnly}
                            fitView
                            fitViewOptions={{ padding: 0.2 }}
                            minZoom={0.2}
                            maxZoom={2}
                            deleteKeyCode={readOnly ? null : "Delete"}
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

                {/* ── Hint bar — hidden in readOnly ── */}
                {!readOnly && (
                    <div className="ib-hints">
                        <span className="ib-hint">DRAG CARDS TO REPOSITION</span>
                        <span className="ib-hint__sep">·</span>
                        <span className="ib-hint">DRAG FROM ◼ HANDLES TO CONNECT</span>
                        <span className="ib-hint__sep">·</span>
                        <span className="ib-hint">DEL KEY REMOVES SELECTED THREAD</span>
                        <span className="ib-hint__sep">·</span>
                        <span className="ib-hint">SCROLL TO ZOOM</span>
                    </div>
                )}
                {readOnly && (
                    <div className="ib-hints ib-hints--readonly">
                        <span className="ib-hint">READ-ONLY VIEW · SCROLL TO ZOOM · BOARD SAVED BY STUDENT</span>
                    </div>
                )}
            </div>

            {/* ── Annotation Modal — only in student mode ── */}
            {!readOnly && annotationModal.open && (
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