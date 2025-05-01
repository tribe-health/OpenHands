#!/bin/bash
set -e

VSCODE_PORT="${VSCODE_PORT:-40000}"
OPENVSCODE_BIN="/openhands/.openvscode-server/bin/openvscode-server"

if [ -x "$OPENVSCODE_BIN" ]; then
  echo "Starting OpenVSCode server on port $VSCODE_PORT..."
  exec "$OPENVSCODE_BIN" --port "$VSCODE_PORT" --without-connection-token --disable-x-frame-options
else
  echo "OpenVSCode server binary not found, skipping."
  exit 0
fi