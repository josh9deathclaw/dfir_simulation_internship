import { useState, useEffect, useCallback } from 'react';
import { getToken } from '../../utils/auth';
import { API } from '../../utils/api';

// ─────────────────────────────────────────────────────────────────────────────
// VMPanel
//
// Manages the full lifecycle of a student's VM session:
//   1. On mount: checks if a container is already running (handles refresh)
//   2. If not running: starts one and gets the noVNC URL back
//   3. Renders the noVNC desktop in an iframe
//   4. On unmount (student exits simulator): stops the container
//
// Props:
//   attemptId  — the current attempt UUID, used to look up / create the VM
//   onError    — optional callback if the VM fails to start
// ─────────────────────────────────────────────────────────────────────────────
export default function VMPanel({ attemptId, onError }) {
    // 'idle' | 'checking' | 'starting' | 'ready' | 'error'
    const [vmState, setVmState] = useState('idle');
    const [vmUrl,   setVmUrl]   = useState(null);
    const [error,   setError]   = useState(null);

    function authHeaders() {
        const token = getToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    // ── Start VM lifecycle on mount ───────────────────────────────────────────
    useEffect(() => {
        if (!attemptId) return;
        initVM();

        // Stop the container when the component unmounts.
        // This fires when the student navigates away from the simulator.
        return () => {
            stopVM();
        };
    }, [attemptId]);

    async function initVM() {
        setVmState('checking');
        try {
            // Poll /status until SimulatorPage has started the VM.
            // VMPanel never calls /start — SimulatorPage owns that.
            // This avoids the race where two callers both try to start a container.
            let attempts = 0;
            while (attempts < 30) {
                const statusRes  = await fetch(API(`/vm/status/${attemptId}`), {
                    headers: authHeaders()
                });
                const statusData = await statusRes.json();

                if (statusData.running) {
                    setVmUrl(statusData.url);
                    setVmState('ready');
                    return;
                }

                attempts++;
                // Wait 4s before polling again
                await new Promise(resolve => setTimeout(resolve, 4000));
            }
            throw new Error('VM did not become ready in time');
        } catch (err) {
            console.error('VMPanel init error:', err);
            setError(err.message);
            setVmState('error');
            if (onError) onError(err.message);
        }
    }

    async function stopVM() {
        try {
            await fetch(API('/vm/stop'), {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body:    JSON.stringify({ attempt_id: attemptId })
            });
        } catch (err) {
            // Silent fail on cleanup — the container will be cleaned up
            // manually or by a future cleanup job
            console.warn('VMPanel stop error:', err);
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────
    if (vmState === 'idle' || vmState === 'checking') {
        return (
            <div className="vm-panel vm-panel--loading">
                <div className="vm-panel__status">
                    &gt; INITIALISING FORENSIC WORKSTATION
                    <span className="sim-feed__blink">_</span>
                </div>
            </div>
        );
    }

    if (vmState === 'starting') {
        return (
            <div className="vm-panel vm-panel--loading">
                <div className="vm-panel__status">
                    &gt; LAUNCHING VIRTUAL MACHINE
                    <span className="sim-feed__blink">_</span>
                </div>
                <div className="vm-panel__sub">
                    This may take a few seconds...
                </div>
            </div>
        );
    }

    if (vmState === 'error') {
        return (
            <div className="vm-panel vm-panel--error">
                <div className="vm-panel__status">
                    &gt; VM INITIALISATION FAILED
                </div>
                <div className="vm-panel__sub">{error}</div>
            </div>
        );
    }

    // vmState === 'ready'
    // Open the VM in a new tab and monitor the connection
    if (vmUrl && !window.__vmWindowOpened) {
        window.__vmWindowOpened = true;
        window.open(vmUrl, 'ForensicWorkstation');
    }
    return null;
}