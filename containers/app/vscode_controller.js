// VSCode Controller/Wrapper Prototype
// -----------------------------------
// Node.js microservice for managing OpenVSCode and sandbox instances per user/session.
// Communicates over persistent, authenticated WebSocket connection using JWTs.
// Handles session lifecycle, project switching, file sync, code execution, and resource cleanup.
// All logic for OpenVSCode/sandbox is stubbed for now. Logging is provided for all messages.
// Designed for future extension and integration.

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// ====== CONFIGURATION ======
const WS_PORT = process.env.VSCODE_CONTROLLER_PORT || 8081;
const JWT_SECRET = process.env.VSCODE_CONTROLLER_JWT_SECRET || 'dev_secret_change_me';

// ====== MOCK SESSION/SANDBOX MANAGER ======
class SessionManager {
    constructor() {
        this.sessions = new Map(); // sessionId -> { userId, openVSCode, sandbox }
    }

    createSession(userId) {
        const sessionId = uuidv4();
        // Stub: create mock OpenVSCode and sandbox instances
        this.sessions.set(sessionId, {
            userId,
            openVSCode: { id: `vscode-${sessionId}` },
            sandbox: { id: `sandbox-${sessionId}` }
        });
        return sessionId;
    }

    destroySession(sessionId) {
        this.sessions.delete(sessionId);
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    switchProject(sessionId, projectId) {
        // Stub: pretend to switch project
        const session = this.sessions.get(sessionId);
        if (session) session.currentProject = projectId;
    }

    syncFile(sessionId, filePath, content) {
        // Stub: pretend to sync file
    }

    execRequest(sessionId, command) {
        // Stub: pretend to execute command
        return { output: `Executed: ${command}`, exitCode: 0 };
    }

    cleanupResources(sessionId) {
        // Stub: pretend to cleanup
    }
}

const sessionManager = new SessionManager();

// ====== MESSAGE ENVELOPE ======
// All messages: { type: string, requestId: string, payload: object }
function sendMessage(ws, type, payload, requestId = null) {
    const envelope = { type, requestId, payload };
    ws.send(JSON.stringify(envelope));
    console.log('[SEND]', envelope);
}

function logReceived(msg) {
    console.log('[RECV]', msg);
}

// ====== WEBSOCKET SERVER WITH JWT AUTH ======
const wss = new WebSocket.Server({ port: WS_PORT });
console.log(`VSCode Controller WebSocket server listening on port ${WS_PORT}`);

wss.on('connection', function connection(ws, req) {
    // JWT handshake: expect first message to be { type: 'auth', token: '...' }
    let authed = false;
    let userId = null;

    ws.on('message', function incoming(message) {
        let msg;
        try {
            msg = JSON.parse(message);
        } catch (e) {
            sendMessage(ws, 'error', { error: 'Invalid JSON' });
            return;
        }
        logReceived(msg);

        // AUTHENTICATION
        if (!authed) {
            if (msg.type === 'auth' && msg.token) {
                try {
                    const decoded = jwt.verify(msg.token, JWT_SECRET);
                    userId = decoded.sub || decoded.userId || 'unknown';
                    authed = true;
                    sendMessage(ws, 'auth_ok', { userId });
                } catch (e) {
                    sendMessage(ws, 'error', { error: 'Invalid JWT' });
                    ws.close();
                }
            } else {
                sendMessage(ws, 'error', { error: 'Authentication required' });
                ws.close();
            }
            return;
        }

        // MESSAGE HANDLERS
        switch (msg.type) {
            case 'session_create': {
                const sessionId = sessionManager.createSession(userId);
                sendMessage(ws, 'session_created', { sessionId }, msg.requestId);
                break;
            }
            case 'session_destroy': {
                const { sessionId } = msg.payload || {};
                sessionManager.destroySession(sessionId);
                sendMessage(ws, 'session_destroyed', { sessionId }, msg.requestId);
                break;
            }
            case 'project_switch': {
                const { sessionId, projectId } = msg.payload || {};
                sessionManager.switchProject(sessionId, projectId);
                sendMessage(ws, 'project_switched', { sessionId, projectId }, msg.requestId);
                break;
            }
            case 'file_sync': {
                const { sessionId, filePath, content } = msg.payload || {};
                sessionManager.syncFile(sessionId, filePath, content);
                sendMessage(ws, 'file_synced', { sessionId, filePath }, msg.requestId);
                break;
            }
            case 'exec_request': {
                const { sessionId, command } = msg.payload || {};
                const result = sessionManager.execRequest(sessionId, command);
                sendMessage(ws, 'exec_result', { sessionId, ...result }, msg.requestId);
                break;
            }
            case 'resource_cleanup': {
                const { sessionId } = msg.payload || {};
                sessionManager.cleanupResources(sessionId);
                sendMessage(ws, 'resource_cleaned', { sessionId }, msg.requestId);
                break;
            }
            case 'error': {
                // Log error messages from client
                console.error('[CLIENT ERROR]', msg.payload);
                break;
            }
            default: {
                sendMessage(ws, 'error', { error: `Unknown message type: ${msg.type}` }, msg.requestId);
            }
        }
    });

    ws.on('close', () => {
        // Optionally: clean up all sessions for this user
        // For now, just log
        console.log(`[CLOSE] WebSocket closed for user ${userId}`);
    });
});

// ====== NOTES FOR EXTENSION ======
// - Replace stubbed session/sandbox logic with real process/container management.
// - Integrate with OpenHands as needed.
// - Add persistent storage, metrics, and more robust error handling as required.
// - Consider per-user resource limits and security hardening.