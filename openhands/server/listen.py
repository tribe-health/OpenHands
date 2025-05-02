import os

from openhands.server.app import app as base_app
from openhands.server.middleware import (
    AttachConversationMiddleware,
    CacheControlMiddleware,
    InMemoryRateLimiter,
    LocalhostCORSMiddleware,
    RateLimitMiddleware,
)
from openhands.server.static import SPAStaticFiles

# Create the ASGI app based on mode
CUSTOM_DOMAIN = bool(os.environ.get("CUSTOM_DOMAIN_URL"))

# For frontend communication, we still need Socket.IO
import socketio
from openhands.server.shared import sio
from openhands.server.listen_socket import *  # Import Socket.IO event handlers

# Mount static files after determining mode
if os.getenv('SERVE_FRONTEND', 'true').lower() == 'true':
    # Don't mount static files at root in local mode to avoid WebSocket conflicts
    if CUSTOM_DOMAIN:
        base_app.mount(
            '/', SPAStaticFiles(directory='./frontend/build', html=True), name='dist'
        )
    else:
        # In local mode, mount static files at a specific path to avoid WebSocket conflicts
        base_app.mount(
            '/static', SPAStaticFiles(directory='./frontend/build', html=True), name='dist'
        )

base_app.add_middleware(
    LocalhostCORSMiddleware,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

base_app.add_middleware(CacheControlMiddleware)
base_app.add_middleware(
    RateLimitMiddleware,
    rate_limiter=InMemoryRateLimiter(requests=10, seconds=1),
)
base_app.middleware('http')(AttachConversationMiddleware(base_app))

# Create the final ASGI app based on mode
if CUSTOM_DOMAIN:
    # In custom domain mode, use the FastAPI app directly
    app = base_app
    print("[listen] Running in custom domain mode with direct FastAPI app")
    print(f"[listen] CUSTOM_DOMAIN_URL: {os.environ.get('CUSTOM_DOMAIN_URL')}")
else:
    # In local mode, wrap the FastAPI app with Socket.IO for WebSocket support
    app = socketio.ASGIApp(sio, other_asgi_app=base_app, socketio_path='/ws')
    print("[listen] Running in local mode with Socket.IO wrapper")
    
    # Add a route for the root path to serve the index.html file
    @base_app.get("/")
    async def get_index():
        from fastapi.responses import FileResponse
        return FileResponse('./frontend/build/index.html')
