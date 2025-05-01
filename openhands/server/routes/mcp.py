# To support automatic reload of MCP servers when the config file changes,
# use a file watcher (e.g., watchdog) in the backend. When the config file
# (e.g., config.toml) is modified, call `await app.state.mcp_manager.reload()`.
# This can be implemented in the FastAPI startup or as a background task.
from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

app = APIRouter(prefix="/api/mcp")

@app.post("/reload")
async def reload_mcp_servers(request: Request):
    """
    Reload all MCP servers and their tools/resources/prompts.
    """
    mcp_manager = getattr(request.app.state, "mcp_manager", None)
    if mcp_manager is None:
        return JSONResponse(
            {"success": False, "error": "MCP manager not initialized."},
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    try:
        await mcp_manager.reload()
        return JSONResponse({"success": True})
    except Exception as e:
        return JSONResponse(
            {"success": False, "error": str(e)},
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )