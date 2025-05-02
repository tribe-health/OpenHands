# OpenHands OpenVSCode Wrapper

This project is a Node.js wrapper for embedding and managing an OpenVSCode server instance, designed to work directly with the OpenHands backend via a WebSocket connection.

## Features

- Launches OpenVSCode as a child process, mapped to a shared root directory.
- Connects to the OpenHands backend (WebSocket server) for real-time file and event sync.
- Sets up file watchers to propagate file changes.
- Designed for extensibility and future multi-user support.

## Usage

1. Install dependencies:

   ```bash
   cd wrapper
   npm install
   ```

2. Start the wrapper:

   ```bash
   npm start
   ```

3. The wrapper will launch OpenVSCode and connect to the OpenHands backend as configured.

## Directory Structure

- `index.js` - Main entry point for the wrapper logic.
- `package.json` - Project metadata and dependencies.
- `.gitignore` - Ignore node_modules, logs, and environment files.

## Configuration

- Ensure both the wrapper and OpenHands are mapped to the same root directory for file operations.
- WebSocket connection details should be set in environment variables or a config file (to be implemented).

## Next Steps

- Implement `index.js` to launch OpenVSCode, connect to OpenHands, and set up file watchers.
- Add configuration for root directory and WebSocket server address.