// OpenHands OpenVSCode Wrapper
// Main entry point for launching OpenVSCode as a child process and connecting to OpenHands via WebSocket.

const { spawn } = require('child_process');
const chokidar = require('chokidar');
const path = require('path');
const Redis = require('ioredis');
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = 6379;

// Redis channels for communication
const WRAPPER_EVENTS_CHANNEL = 'openhands:wrapper:events';
const SERVER_EVENTS_CHANNEL = 'openhands:server:events';

// === Configuration ===
const OPENVSCODE_BIN = process.env.OPENVSCODE_BIN || '/opt/openvscode-server/bin/openvscode-server';
const OPENVSCODE_PORT = process.env.OPENVSCODE_PORT || 3100;
const OPENVSCODE_ROOT = process.env.OPENVSCODE_ROOT || path.resolve(__dirname, '..');
// WebSocket URL no longer needed as we use Redis for all communication

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

// === Redis-based communication ===
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

 return pub;
}

// === Watch for file changes in the shared root directory ===
function setupFileWatcher(pub) {
  const watcher = chokidar.watch(OPENVSCODE_ROOT, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true
  });

  watcher
    .on('add', filePath => {
      pub.publish(WRAPPER_EVENTS_CHANNEL, JSON.stringify({ type: 'file_add', path: filePath }));
    })
    .on('change', filePath => {
      pub.publish(WRAPPER_EVENTS_CHANNEL, JSON.stringify({ type: 'file_change', path: filePath }));
    })
    .on('unlink', filePath => {
      pub.publish(WRAPPER_EVENTS_CHANNEL, JSON.stringify({ type: 'file_unlink', path: filePath }));
    });

  console.log(`[wrapper] Watching for file changes in ${OPENVSCODE_ROOT}`);
}

// === Main startup ===
async function waitForServerReady() {
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
}

async function main() {
  // Launch OpenVSCode
  launchOpenVSCode(currentWorkspaceDir);

  // Wait for server "ready" message via Redis before starting communication
  try {
    await waitForServerReady();
  } catch (err) {
    console.error('[wrapper] Startup aborted:', err);
    process.exit(1);
  }

  // Set up Redis-based communication and file watcher
  const pub = setupRedisCommunication();
  setupFileWatcher(pub);
}

main();