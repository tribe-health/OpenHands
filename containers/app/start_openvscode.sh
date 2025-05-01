#!/bin/bash
set -e

# Determine the project directory to open in OpenVSCode.
# Priority:
#   1. /opt/current_project_path (if present and non-empty)
#   2. CURRENT_PROJECT_PATH environment variable (if set and non-empty)
#   3. /opt/workspace_base (default)

VSCODE_PORT="${VSCODE_PORT:-40000}"
OPENVSCODE_BIN="/openhands/.openvscode-server/bin/openvscode-server"

# Resolve project directory
if [ -f "/opt/current_project_path" ] && [ -s "/opt/current_project_path" ]; then
  PROJECT_DIR="$(cat /opt/current_project_path)"
elif [ -n "${CURRENT_PROJECT_PATH:-}" ]; then
  PROJECT_DIR="$CURRENT_PROJECT_PATH"
else
  PROJECT_DIR="/opt/workspace_base"
fi

if [ -x "$OPENVSCODE_BIN" ]; then
  echo "Starting OpenVSCode server on port $VSCODE_PORT with project directory: $PROJECT_DIR"
  exec "$OPENVSCODE_BIN" --port "$VSCODE_PORT" --without-connection-token --disable-x-frame-options --server-base-path vscode "$PROJECT_DIR"
else
  echo "OpenVSCode server binary not found, skipping."
  exit 0
fi