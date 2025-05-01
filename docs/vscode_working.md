# Setting Up VSCode Server with Custom Domain

This guide explains how to properly configure the VSCode server when running OpenHands with a custom domain.

## Environment Variables

The following environment variables must be set to ensure proper VSCode server operation:

### Required Variables

```bash
# The public-facing domain where your OpenHands instance is hosted
# Must include the protocol (http:// or https://)
CUSTOM_DOMAIN_URL=https://openhands.skytok.net

# Required when running in Docker to ensure proper internal routing
DOCKER_CONTAINER=true

# The port that VSCode server will listen on (default: 40000)
VSCODE_PORT=40000
```

### Where to Set Variables

1. **Docker Compose File** (`docker-compose.yml`):
   ```yaml
   services:
     openhands:
       environment:
         - CUSTOM_DOMAIN_URL=https://openhands.skytok.net
         - DOCKER_CONTAINER=true
         - VSCODE_PORT=40000
       ports:
         - "3000:3000"            # Main application port
         - "40000:40000"          # VSCode port
   ```

2. **Environment File** (`.env`):
   ```bash
   CUSTOM_DOMAIN_URL=https://openhands.skytok.net
   DOCKER_CONTAINER=true
   VSCODE_PORT=40000
   ```

## Nginx Configuration

The VSCode server requires specific Nginx configuration to work properly. Two key components must be configured:

1. **Base Path Configuration**: The VSCode server must be started with the correct base path:
   ```bash
   # This is handled in containers/app/start_openvscode.sh
   openvscode-server --port "$VSCODE_PORT" --server-base-path vscode
   ```

2. **Nginx Location Block**: Must properly proxy requests to the VSCode server:
   ```nginx
   # VSCode proxy location - using fixed port 40000
   location /vscode/ {
       proxy_pass http://localhost:40000/vscode/;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-Proto https;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_read_timeout 300;
       proxy_buffering off;
       proxy_hide_header X-Frame-Options;
       add_header Content-Security-Policy "frame-ancestors *" always;
   }
   ```

## URL Construction

The VSCode URL is constructed in the following way:

1. **Production** (with custom domain):
   - Input: `CUSTOM_DOMAIN_URL=https://openhands.skytok.net`
   - Result: `https://openhands.skytok.net/vscode/`

2. **Local Development** (without custom domain):
   - Result: `http://localhost:40000/vscode/`

## Troubleshooting

### Common Issues

1. **VSCode Shows Blank Screen**:
   - Check that `DOCKER_CONTAINER=true` is set
   - Verify Nginx is properly proxying the `/vscode/` path
   - Check browser console for CORS or CSP errors

2. **Cannot Connect to VSCode Server**:
   - Verify port 40000 is exposed in Docker and Nginx
   - Check Docker logs for VSCode server startup errors
   - Ensure the VSCode server started with `--server-base-path vscode`

3. **host.docker.internal Issues**:
   - This is an internal Docker DNS name and should never be exposed to the frontend
   - If you see this URL in the browser, check that `CUSTOM_DOMAIN_URL` is set correctly

### Debugging

You can monitor the VSCode URL configuration through the logs:

1. **Runtime Logs** show the URL configuration:
   ```
   INFO: Running in Docker container, using internal URL: http://host.docker.internal
   INFO: Using custom domain for VSCode: https://openhands.skytok.net
   ```

2. **Server Logs** show client requests:
   ```
   INFO: VSCode URL request received - Runtime type: DockerRuntime
   INFO: Returning VSCode URL to client: https://openhands.skytok.net/vscode/
   ```

## Security Considerations

1. **SSL/TLS**: Always use HTTPS in production
2. **CORS**: Ensure your Nginx configuration includes proper CORS headers
3. **CSP**: The Content-Security-Policy header is required for iframe embedding
4. **X-Frame-Options**: Must be disabled for VSCode to work in an iframe

## Additional Notes

- The VSCode server runs on a fixed port (40000 by default) to simplify reverse proxy configuration
- The server is started without a connection token (`--without-connection-token`) for iframe compatibility
- All WebSocket connections must be properly proxied for full functionality 