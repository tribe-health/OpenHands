import warnings
from contextlib import asynccontextmanager

with warnings.catch_warnings():
    warnings.simplefilter('ignore')

from openhands.core.config import AppConfig
from openhands.core.mcp_client_manager import MCPClientManager
import asyncio

from fastapi import (
    FastAPI,
)

import openhands.agenthub  # noqa F401 (we import this to get the agents registered)
from openhands import __version__
from openhands.server.routes.conversation import app as conversation_api_router
from openhands.server.routes.feedback import app as feedback_api_router
from openhands.server.routes.files import app as files_api_router
from openhands.server.routes.git import app as git_api_router
from openhands.server.routes.manage_conversations import (
    app as manage_conversation_api_router,
)
from openhands.server.routes.public import app as public_api_router
from openhands.server.routes.security import app as security_api_router
from openhands.server.routes.settings import app as settings_router
from openhands.server.routes.trajectory import app as trajectory_router
from openhands.server.shared import conversation_manager
from openhands.server.routes.mcp import app as mcp_router

@asynccontextmanager
async def _lifespan(app: FastAPI):
    # Initialize MCP manager and attach to app state
    config = AppConfig()  # You may want to load from file/env as appropriate
    mcp_manager = MCPClientManager(config.mcp)
    await mcp_manager.initialize()
    app.state.mcp_manager = mcp_manager
    import os
    import redis
    redis_host = os.environ.get("REDIS_HOST", "localhost")
    try:
        r = redis.Redis(host=redis_host, port=6379)
        r.publish("openhands:ready", "ready")
        print(f"[startup] Published 'ready' to Redis channel openhands:ready at {redis_host}:6379")
    except Exception as e:
        print(f"[startup] Failed to publish 'ready' to Redis: {e}")
    async with conversation_manager:
        yield


app = FastAPI(
    title='OpenHands',
    description='OpenHands: Code Less, Make More',
    version=__version__,
    lifespan=_lifespan,
)


@app.get('/health')
async def health():
    return 'OK'


app.include_router(public_api_router)
app.include_router(files_api_router)
app.include_router(security_api_router)
app.include_router(feedback_api_router)
app.include_router(conversation_api_router)
app.include_router(manage_conversation_api_router)
app.include_router(settings_router)
app.include_router(git_api_router)
app.include_router(trajectory_router)
app.include_router(mcp_router)
