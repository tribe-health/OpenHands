// OpenHands OpenVSCode Wrapper
// Main entry point for launching OpenVSCode as a child process and connecting to OpenHands via WebSocket.

const { spawn } = require('child_process');
const WebSocket = require('ws');
const chokidar = require('chokidar');
const path = require('path');

// === Configuration ===
const OPENVSCODE_BIN = process.env.OPENVSCODE_BIN || '/opt/openvscode-server/bin/openvscode-server';
const OPENVSCODE_PORT = process.env.OPENVSCODE_PORT || 3100;
const OPENVSCODE_ROOT = process.env.OPENVSCODE_ROOT || path.resolve(__dirname, '..');
const OPENHANDS_WS_URL = process.env.OPENHANDS_WS_URL || 'ws://localhost:8080/ws';

// === Launch OpenVSCode as a child process ===
let openVSCodeProcess = null;
let currentWorkspaceDir = OPENVSCODE_ROOT;

function launchOpenVSCode(workspaceDir) {
  currentWorkspaceDir = workspaceDir;
  console.log(`[wrapper] Launching OpenVSCode at ${workspaceDir} on port ${OPENVSCODE_PORT}...`);
  const args = [
    '--host', '0.0.0.0',
    '--port', OPENVSCODE_PORT,
    '--without-connection-token',
    workspaceDir
  ];
  const child = spawn(OPENVSCODE_BIN, args, {
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code) => {
    console.log(`[wrapper] OpenVSCode exited with code ${code}`);
  });

  openVSCodeProcess = child;
  return child;
}

function restartOpenVSCode(newWorkspaceDir) {
  if (openVSCodeProcess) {
    console.log('[wrapper] Stopping current OpenVSCode process...');
    openVSCodeProcess.kill();
    openVSCodeProcess = null;
  }
  launchOpenVSCode(newWorkspaceDir);
}

// === Connect to OpenHands WebSocket server ===
function connectToOpenHands() {
  console.log(`[wrapper] Connecting to OpenHands WebSocket at ${OPENHANDS_WS_URL}...`);
  const ws = new WebSocket(OPENHANDS_WS_URL);

  ws.on('open', () => {
    console.log('[wrapper] Connected to OpenHands WebSocket.');
    // Optionally, send a registration or hello message here
  });

  ws.on('message', (data) => {
    // Handle messages from OpenHands (e.g., file generation, project switch)
    console.log('[wrapper] Received message from OpenHands:', data.toString());
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'project_switch' || msg.type === 'workspace_reload') {
        const newDir = msg.directory;
        if (newDir && typeof newDir === 'string') {
          console.log(`[wrapper] Received workspace directory change: ${newDir}`);
          restartOpenVSCode(newDir);
        } else {
          console.warn('[wrapper] Directory change event missing "directory" field.');
        }
      }
      // Handle other message types as needed
    } catch (err) {
      console.error('[wrapper] Error parsing message from OpenHands:', err);
    }
  });

  ws.on('close', () => {
    console.log('[wrapper] WebSocket connection closed. Attempting to reconnect in 5s...');
    setTimeout(connectToOpenHands, 5000);
  });

  ws.on('error', (err) => {
    console.error('[wrapper] WebSocket error:', err);
  });

  return ws;
}

// === Watch for file changes in the shared root directory ===
function setupFileWatcher(ws) {
  const watcher = chokidar.watch(OPENVSCODE_ROOT, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true
  });

  watcher
    .on('add', filePath => {
      ws && ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'file_add', path: filePath }));
    })
    .on('change', filePath => {
      ws && ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'file_change', path: filePath }));
    })
    .on('unlink', filePath => {
      ws && ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'file_unlink', path: filePath }));
    });

  console.log(`[wrapper] Watching for file changes in ${OPENVSCODE_ROOT}`);
}

// === Main startup ===
function main() {
  // Launch OpenVSCode
  launchOpenVSCode(currentWorkspaceDir);

  // Connect to OpenHands and set up file watcher
  let ws = connectToOpenHands();
  setupFileWatcher(ws);
}

main();