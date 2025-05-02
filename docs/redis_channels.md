# Redis Channels for OpenHands

This document describes the Redis channels used for communication between different components of the OpenHands system in custom domain mode.

## Custom Domain vs Local Mode

OpenHands supports two operational modes:

1. **Custom Domain Mode** - Uses Redis for wrapper-server communication
   - Enabled when `CUSTOM_DOMAIN_URL` environment variable is set
   - Suitable for production deployments with custom domains
   - More robust for distributed setups

2. **Local Mode** - Uses WebSocket for wrapper-server communication
   - Default when `CUSTOM_DOMAIN_URL` is not set
   - Suitable for local development
   - Simpler setup without Redis dependency

## Redis Channels (Custom Domain Mode Only)

| Channel | Publisher | Subscriber | Purpose |
|---------|-----------|------------|---------|
| `openhands:ready` | Server | Wrapper | Server signals it is fully initialized and ready to accept connections |
| `openhands:wrapper:events` | Wrapper | Server | File events (file_add, file_change, file_unlink) from the wrapper to the server |
| `openhands:server:events` | Server | Wrapper | Control messages (project_switch, workspace_reload) from the server to the wrapper |

## Message Formats

### File Events (wrapper → server)

```json
{
  "type": "file_add",
  "path": "/path/to/file"
}
```

```json
{
  "type": "file_change",
  "path": "/path/to/file"
}
```

```json
{
  "type": "file_unlink",
  "path": "/path/to/file"
}
```

### Control Messages (server → wrapper)

```json
{
  "type": "project_switch",
  "directory": "/path/to/new/project"
}
```

```json
{
  "type": "workspace_reload",
  "directory": "/path/to/workspace"
}
```

## Implementation Notes

- All messages are JSON-encoded strings.
- In custom domain mode:
  - The wrapper subscribes to `openhands:server:events` and publishes to `openhands:wrapper:events`.
  - The server subscribes to `openhands:wrapper:events` and publishes to `openhands:server:events`.
  - The server publishes a "ready" message to `openhands:ready` when it is fully initialized.
  - The wrapper waits for the "ready" message before starting its normal operation.
- In local mode:
  - WebSocket communication is used instead of Redis.
  - The wrapper connects to the server's WebSocket endpoint.
  - The server wraps the FastAPI app with Socket.IO for WebSocket support.