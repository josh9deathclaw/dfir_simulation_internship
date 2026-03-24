const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const Docker   = require('dockerode');
const fs       = require('fs');
const path     = require('path');
const { authenticateToken } = require('../middleware/auth');

// Connect to the Docker daemon running on this machine.
// On Windows with Docker Desktop, Docker exposes a named pipe at this path.
// dockerode knows how to talk to it automatically when no options are passed
// on Linux/Mac, but on Windows we need to specify the socket path explicitly.
const docker = new Docker();

// The image name we built in the forensic-desktop folder.
// This must exactly match the -t flag used in `docker build -t dfir-desktop .`
const DESKTOP_IMAGE = 'dfir-desktop';

// Base path on the HOST machine where we create per-attempt workspace folders.
// Each attempt gets its own subfolder: vm-workspaces/{attemptId}/evidence
// This folder is bind-mounted into the container so files written here
// appear instantly on the student's desktop in Thunar.
const WORKSPACES_DIR = path.join(__dirname, '..', '..', 'vm-workspaces');


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vm/status/:attemptId
//
// Called by SimulatorPage on load to check if a container is already running
// for this attempt. This handles the page-refresh case — we don't want to
// spawn a new container every time the student refreshes the page.
//
// Returns { running: true, url } if a container exists, or { running: false }
// if nothing is running for this attempt.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status/:attemptId', authenticateToken, async (req, res) => {
    try {
        const { attemptId } = req.params;

        const result = await db.query(
            `SELECT * FROM vm_instances
             WHERE  attempt_id = $1
             AND    status     = 'running'
             LIMIT  1`,
            [attemptId]
        );

        if (result.rows.length === 0) {
            return res.json({ running: false });
        }

        const instance = result.rows[0];

        // Verify the container is actually still running in Docker.
        // The DB might say 'running' but the container could have crashed.
        try {
            const container = docker.getContainer(instance.container_id);
            const info      = await container.inspect();
            if (!info.State.Running) {
                // Container crashed — mark it stopped in DB
                await db.query(
                    `UPDATE vm_instances SET status = 'stopped', stopped_at = NOW()
                     WHERE id = $1`,
                    [instance.id]
                );
                return res.json({ running: false });
            }

            // Additional health check: verify noVNC is responding
            try {
                const http = require('http');
                const url = require('url');
                const noVncUrl = `http://localhost:${instance.host_port}/vnc.html`;

                await new Promise((resolve, reject) => {
                    const req = http.request({
                        hostname: 'localhost',
                        port: instance.host_port,
                        path: '/vnc.html',
                        method: 'HEAD',
                        timeout: 3000
                    }, (res) => {
                        if (res.statusCode === 200) {
                            resolve();
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}`));
                        }
                    });

                    req.on('error', reject);
                    req.on('timeout', () => {
                        req.destroy();
                        reject(new Error('timeout'));
                    });
                    req.end();
                });
            } catch (healthErr) {
                console.warn(`noVNC health check failed for port ${instance.host_port}:`, healthErr.message);
                // Container exists but noVNC isn't responding — mark as stopped
                await db.query(
                    `UPDATE vm_instances SET status = 'stopped', stopped_at = NOW()
                     WHERE id = $1`,
                    [instance.id]
                );
                return res.json({ running: false });
            }
        } catch {
            // Container doesn't exist in Docker at all
            await db.query(
                `UPDATE vm_instances SET status = 'stopped', stopped_at = NOW()
                 WHERE id = $1`,
                [instance.id]
            );
            return res.json({ running: false });
        }

        res.json({
            running: true,
            url:     `http://localhost:${instance.host_port}/vnc.html`
        });
    } catch (err) {
        console.error('GET /api/vm/status error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/vm/start
//
// Starts a new Docker container for this attempt and returns the noVNC URL.
//
// Flow:
//   1. Check no container is already running for this attempt
//   2. Create the workspace directory on the host
//   3. Find a free port
//   4. Start the container with the workspace bind-mounted
//   5. Store the container details in vm_instances
//   6. Return the noVNC URL to React
// ─────────────────────────────────────────────────────────────────────────────
router.post('/start', authenticateToken, async (req, res) => {
    let vmInstanceId = null;
    let container = null;

    try {
        const { attempt_id } = req.body;

        if (!attempt_id) {
            return res.status(400).json({ message: 'attempt_id is required' });
        }

        // ─────────────────────────────────────────
        // STEP 1: INSERT PLACEHOLDER (prevents race)
        // ─────────────────────────────────────────
        await db.query('BEGIN');
        try {
            const insertResult = await db.query(`
                INSERT INTO vm_instances (attempt_id, container_id, host_port, status)
                VALUES ($1, 'pending', 0, 'starting')
                RETURNING id
            `, [attempt_id]);
            vmInstanceId = insertResult.rows[0].id;

            await db.query('COMMIT');
        } catch (err) {
            await db.query('ROLLBACK');

            if (err.code === '23505') { // duplicate attempt running
                // fetch existing container info
                const existing = await db.query(`
                    SELECT * FROM vm_instances
                    WHERE attempt_id = $1 AND status = 'running'
                    LIMIT 1
                `, [attempt_id]);

                if (existing.rows.length > 0) {
                    const host = process.env.VM_HOST || req.hostname;
                    return res.json({
                        url: `http://${host}:${existing.rows[0].host_port}/vnc.html`,
                        containerId: existing.rows[0].container_id,
                        hostPort: existing.rows[0].host_port,
                        reused: true
                    });
                }

                return res.status(409).json({ message: 'VM already starting, retry shortly' });
            }

            throw err;
        }

        // ─────────────────────────────────────────
        // STEP 2: CREATE WORKSPACE
        // ─────────────────────────────────────────
        const workspacePath = path.join(WORKSPACES_DIR, attempt_id, 'evidence');
        fs.mkdirSync(workspacePath, { recursive: true });

        console.log(`[VM START] Workspace created at: ${workspacePath}`);


        // ─────────────────────────────────────────
        // STEP 3: CREATE + START CONTAINER
        // ─────────────────────────────────────────
        container = await docker.createContainer({
            Image: DESKTOP_IMAGE,
            Env: [
                'DISPLAY_WIDTH=1280',
                'DISPLAY_HEIGHT=800',
                'RUN_XTERM=no',
                'RUN_FLUXBOX=yes'
            ],
            HostConfig: {
                PortBindings: {
                    '8080/tcp': [{ HostPort: "" }] // Docker auto-assigns
                },
                Binds: [
                    `${workspacePath}:/home/student/Desktop/evidence`
                ]
            }
        });

        await container.start();
        console.log(`[VM START] Container started: ${container.id}`);

        // ─────────────────────────────────────────
        // STEP 4: GET ASSIGNED PORT
        // ─────────────────────────────────────────
        const data = await container.inspect();
        const hostPort = data.NetworkSettings.Ports['8080/tcp'][0].HostPort;
        console.log(`[VM START] Assigned host port: ${hostPort}`);

        // ─────────────────────────────────────────
        // STEP 5: UPDATE DB
        // ─────────────────────────────────────────
        await db.query(`
            UPDATE vm_instances
            SET container_id = $1,
                host_port = $2,
                status = 'running'
            WHERE id = $3
        `, [container.id, hostPort, vmInstanceId]);

        // ─────────────────────────────────────────
        // STEP 6: WAIT FOR noVNC
        // ─────────────────────────────────────────
        const http = require("http");
        async function waitForNoVNC(port) {
            for (let i = 0; i < 10; i++) {
                try {
                    await new Promise((resolve, reject) => {
                        const req = http.request({
                            hostname: "localhost",
                            port,
                            path: "/vnc.html",
                            method: "GET",
                            timeout: 2000
                        }, res => {
                            res.statusCode === 200 ? resolve() : reject();
                        });
                        req.on("error", reject);
                        req.end();
                    });
                    return;
                } catch {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            throw new Error("noVNC did not start");
        }

        await waitForNoVNC(hostPort);
        console.log(`[VM START] noVNC ready on port ${hostPort}`);

        const host = process.env.VM_HOST || req.hostname;
        res.json({
            url: `http://${host}:${hostPort}/vnc.html`,
            containerId: container.id,
            hostPort
        });

    } catch (err) {
        console.error('POST /api/vm/start error:', err);

        // ─────────────────────────────────────────
        // CLEANUP
        // ─────────────────────────────────────────
        if (container) {
            try { await container.stop(); } catch {}
            try { await container.remove(); } catch {}
        }
        if (vmInstanceId) {
            await db.query(`DELETE FROM vm_instances WHERE id = $1`, [vmInstanceId]);
        }

        res.status(500).json({ message: 'Internal server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/vm/stop
//
// Stops and removes the container for a given attempt, then marks it stopped
// in the DB. Called when the student exits the simulator.
//
// We stop then remove (rather than just remove) because a running container
// can't be force-removed without the force flag — stopping first is cleaner.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/stop', authenticateToken, async (req, res) => {
    try {
        const { attempt_id } = req.body;

        const result = await db.query(
            `SELECT * FROM vm_instances
             WHERE  attempt_id = $1
             AND    status     = 'running'
             LIMIT  1`,
            [attempt_id]
        );

        if (result.rows.length === 0) {
            return res.json({ message: 'No running container found for this attempt' });
        }

        const instance = result.rows[0];

        try {
            const container = docker.getContainer(instance.container_id);
            await container.stop();
            await container.remove();
        } catch (dockerErr) {
            // Container might have already stopped or been removed manually.
            // We still want to update the DB, so we log and continue.
            console.warn('Docker stop/remove warning:', dockerErr.message);
        }

        await db.query(
            `UPDATE vm_instances
             SET    status     = 'stopped',
                    stopped_at = NOW()
             WHERE  id         = $1`,
            [instance.id]
        );

        res.json({ message: 'Container stopped' });
    } catch (err) {
        console.error('POST /api/vm/stop error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/vm/inject/:attemptId
//
// Delivers an inject file to the student's VM desktop.
//
// Called by the existing inject release logic in SimulatorPage when an inject
// fires. The inject already has a file_path pointing to the uploaded file in
// /uploads. We copy that file into the attempt's workspace folder on the host,
// and because that folder is bind-mounted into the container, it appears
// instantly on the student's desktop in Thunar.
//
// This is the key insight of the bind-mount approach — no docker exec needed,
// no agent inside the container, no API calls to Docker. We just write a file
// to a folder on the host and Docker's filesystem layer does the rest.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/inject/:attemptId', authenticateToken, async (req, res) => {
    try {
        const { attemptId }          = req.params;
        const { file_path, file_name } = req.body;
        console.log('[VM inject] START', { attemptId, file_path, file_name });

        // file_name may be null in DB — fall back to extracting from file_path
        const resolvedFileName = file_name || file_path?.split('/').pop();
        if (!file_path || !resolvedFileName) {
            return res.status(400).json({ message: 'file_path is required' });
        }

        // Verify a container is running for this attempt
        const result = await db.query(
            `SELECT * FROM vm_instances
             WHERE  attempt_id = $1
             AND    status     = 'running'
             LIMIT  1`,
            [attemptId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No running container for this attempt' });
        }

        // Compute source and destination paths
        const sourcePath = path.join(__dirname, '..', '..', file_path);
        const destPath   = path.join(WORKSPACES_DIR, attemptId, 'evidence', resolvedFileName);

        // ─────────────── LOGS ───────────────
        console.log('[VM inject] START', { attemptId, file_path, file_name });
        console.log('[VM inject] sourcePath:', sourcePath);
        console.log('[VM inject] destPath:', destPath);
        console.log('[VM inject] copying file...');
        // ─────────────────────────────────────

        if (!fs.existsSync(sourcePath)) {
            return res.status(404).json({ message: 'Inject file not found on server' });
        }

        // Copy the file into the VM workspace
        fs.copyFileSync(sourcePath, destPath);
        console.log('[VM inject] copied file to VM successfully', destPath);

        res.json({ message: 'File delivered to VM', file_name: resolvedFileName });
    } catch (err) {
        console.error('POST /api/vm/inject error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;