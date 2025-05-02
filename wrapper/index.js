// OpenHands OpenVSCode Wrapper
// Main entry point for launching OpenVSCode as a child process and connecting to OpenHands.
// Supports both Redis (for custom domain) and WebSocket (for local) communication methods.

const { spawn } = require('child_process');
const chokidar = require('chokidar');
const path = require('path');

// Check if we're in custom domain mode
const CUSTOM_DOMAIN = !!process.env.CUSTOM_DOMAIN_URL;

// Communication configuration
let Redis, WebSocket;
let REDIS_HOST, REDIS_PORT;
let WRAPPER_EVENTS_CHANNEL, SERVER_EVENTS_CHANNEL;
let OPENHANDS_WS_URL;

if (CUSTOM_DOMAIN) {
  // Redis setup for custom domain mode
  Redis = require('ioredis');
  REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  REDIS_PORT = 6379;
  
  // Redis channels for communication
  WRAPPER_EVENTS_CHANNEL = 'openhands:wrapper:events';
  SERVER_EVENTS_CHANNEL = 'openhands:server:events';
} else {
  // WebSocket setup for local mode
  WebSocket = require('ws');
  OPENHANDS_WS_URL = process.env.OPENHANDS_WS_URL || 'ws://localhost:3000/ws';
}

// === Configuration ===
const OPENVSCODE_BIN = process.env.OPENVSCODE_BIN || '/opt/openvscode-server/bin/openvscode-server';
const OPENVSCODE_PORT = process.env.OPENVSCODE_PORT || 3100;
const OPENVSCODE_ROOT = process.env.OPENVSCODE_ROOT || path.resolve(__dirname, '..');

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

// === Communication setup ===
function setupCommunication() {
  if (CUSTOM_DOMAIN) {
    return setupRedisCommunication();
  } else {
    return setupWebSocketCommunication();
  }
}

// === Redis-based communication (for custom domain) ===
function setupRedisCommunication() {
  const pub = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
  const sub = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

  // Subscribe to server events (e.g., project_switch, workspace_reload)
  sub.subscribe(SERVER_EVENTS_CHANNEL, (err, count) => {
    if (err) {
      console.error('[wrapper] Redis subscribe error:', err);
      process.exit(1);
    }
    console.log(`[wrapper] Subscribed to Redis channel '${SERVER_EVENTS_CHANNEL}' for server events.`);
  });

  sub.on('message', (channel, message) => {
    if (channel === SERVER_EVENTS_CHANNEL) {
      try {
        const msg = JSON.parse(message);
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
        console.error('[wrapper] Error parsing message from server via Redis:', err);
      }
    }
  });

  return { type: 'redis', pub };
}

// === WebSocket-based communication (for local mode) ===
function setupWebSocketCommunication() {
  let ws = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const RECONNECT_INTERVAL = 5000; // 5 seconds

  function connectWebSocket() {
    console.log(`[wrapper] Connecting to OpenHands WebSocket at ${OPENHANDS_WS_URL}...`);
    ws = new WebSocket(OPENHANDS_WS_URL);

    ws.on('open', () => {
      console.log('[wrapper] Connected to OpenHands WebSocket');
      reconnectAttempts = 0;
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
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
        console.error('[wrapper] Error parsing message from server via WebSocket:', err);
      }
    });

    ws.on('close', () => {
      console.log('[wrapper] WebSocket connection closed');
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`[wrapper] Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        setTimeout(connectWebSocket, RECONNECT_INTERVAL);
      } else {
        console.error('[wrapper] Max reconnect attempts reached. Giving up.');
      }
    });

    ws.on('error', (err) => {
      console.error('[wrapper] WebSocket error:', err);
    });
  }

  connectWebSocket();

  // Return a WebSocket-compatible publisher object
  return {
    type: 'websocket',
    publish: (channel, message) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  };
}

// === Watch for file changes in the shared root directory ===
function setupFileWatcher(comm) {
  const watcher = chokidar.watch(OPENVSCODE_ROOT, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true
  });

  watcher
    .on('add', filePath => {
      const message = JSON.stringify({ type: 'file_add', path: filePath });
      if (comm.type === 'redis') {
        comm.pub.publish(WRAPPER_EVENTS_CHANNEL, message);
      } else {
        comm.publish(WRAPPER_EVENTS_CHANNEL, message);
      }
    })
    .on('change', filePath => {
      const message = JSON.stringify({ type: 'file_change', path: filePath });
      if (comm.type === 'redis') {
        comm.pub.publish(WRAPPER_EVENTS_CHANNEL, message);
      } else {
        comm.publish(WRAPPER_EVENTS_CHANNEL, message);
      }
    })
    .on('unlink', filePath => {
      const message = JSON.stringify({ type: 'file_unlink', path: filePath });
      if (comm.type === 'redis') {
        comm.pub.publish(WRAPPER_EVENTS_CHANNEL, message);
      } else {
        comm.publish(WRAPPER_EVENTS_CHANNEL, message);
      }
    });

  console.log(`[wrapper] Watching for file changes in ${OPENVSCODE_ROOT}`);
}

// === Main startup ===
async function waitForServerReady() {
  if (CUSTOM_DOMAIN) {
    // Redis-based ready signal for custom domain mode
    return new Promise((resolve, reject) => {
      const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
      let readyReceived = false;
      console.log(`[wrapper] Subscribing to Redis channel 'openhands:ready' at ${REDIS_HOST}:${REDIS_PORT}...`);
      redis.subscribe('openhands:ready', (err, count) => {
        if (err) {
          console.error('[wrapper] Redis subscribe error:', err);
          reject(err);
        }
      });
      redis.on('message', (channel, message) => {
        if (channel === 'openhands:ready' && message === 'ready') {
          if (!readyReceived) {
            readyReceived = true;
            console.log('[wrapper] Received "ready" message from server via Redis. Proceeding with Redis-based communication.');
            redis.disconnect();
            resolve();
          }
        }
      });
      // Optional: timeout if never receives "ready"
      setTimeout(() => {
        if (!readyReceived) {
          console.error('[wrapper] Timed out waiting for "ready" message from server via Redis.');
          redis.disconnect();
          reject(new Error('Timed out waiting for server ready'));
        }
      }, 60000); // 60 seconds
    });
  } else {
    // For local mode, just wait a few seconds for the server to start
    console.log('[wrapper] Local mode: waiting for server to start...');
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('[wrapper] Local mode: proceeding with WebSocket communication');
        resolve();
      }, 5000); // 5 seconds should be enough for local development
    });
  }
}

async function main() {
  // Launch OpenVSCode
  launchOpenVSCode(currentWorkspaceDir);

  // Wait for server "ready" message before starting communication
  try {
    await waitForServerReady();
  } catch (err) {
    console.error('[wrapper] Startup aborted:', err);
    process.exit(1);
  }

  // Set up communication based on mode (Redis for custom domain, WebSocket for local)
  const comm = setupCommunication();
  setupFileWatcher(comm);
  
  console.log(`[wrapper] Running in ${CUSTOM_DOMAIN ? 'custom domain' : 'local'} mode`);
}

main();