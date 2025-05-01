import json

from openhands.core.config.mcp_config import MCPConfig
from openhands.core.logger import openhands_logger as logger
from openhands.events.action.mcp import McpAction
from openhands.events.observation.mcp import MCPObservation
from openhands.events.observation.observation import Observation
from openhands.mcp.client import MCPClient


def convert_mcp_clients_to_tools(mcp_clients: list[MCPClient] | None) -> list[dict]:
    """
    Converts a list of MCPClient instances to a model-agnostic tool/resource/prompt schema.

    Args:
        mcp_clients: List of MCPClient instances or None

    Returns:
        List of dicts describing tools/resources/prompts in a generic, model-agnostic format.
    """
    if mcp_clients is None:
        logger.warning('mcp_clients is None, returning empty list')
        return []

    all_mcp_items = []
    try:
        for client in mcp_clients:
            # Aggregate tools
            for tool_name, tool in getattr(client, "tools", {}).items():
                all_mcp_items.append({
                    "type": "tool",
                    "client": getattr(client, "name", None),
                    "name": tool.get("name"),
                    "description": tool.get("description"),
                    "parameters": tool.get("parameters"),
                    "metadata": {k: v for k, v in tool.items() if k not in ("name", "description", "parameters")},
                })
            # Aggregate resources
            for res_name, res in getattr(client, "resources", {}).items():
                all_mcp_items.append({
                    "type": "resource",
                    "client": getattr(client, "name", None),
                    "name": res.get("name"),
                    "description": res.get("description"),
                    "parameters": res.get("parameters"),
                    "metadata": {k: v for k, v in res.items() if k not in ("name", "description", "parameters")},
                })
            # Aggregate prompts
            for prompt_name, prompt in getattr(client, "prompts", {}).items():
                all_mcp_items.append({
                    "type": "prompt",
                    "client": getattr(client, "name", None),
                    "name": prompt.get("name"),
                    "description": prompt.get("description"),
                    "parameters": prompt.get("parameters"),
                    "metadata": {k: v for k, v in prompt.items() if k not in ("name", "description", "parameters")},
                })
    except Exception as e:
        logger.error(f'Error in convert_mcp_clients_to_tools: {e}')
        return []
    return all_mcp_items


async def create_mcp_clients(
    mcp_servers: list[str],
) -> list[MCPClient]:
    mcp_clients: list[MCPClient] = []
    # Initialize SSE connections
    if mcp_servers:
        for server_url in mcp_servers:
            logger.info(
                f'Initializing MCP agent for {server_url} with SSE connection...'
            )

            client = MCPClient()
            try:
                await client.connect_sse(server_url)
                # Only add the client to the list after a successful connection
                mcp_clients.append(client)
                logger.info(f'Connected to MCP server {server_url} via SSE')
            except Exception as e:
                logger.error(f'Failed to connect to {server_url}: {str(e)}')
                try:
                    await client.disconnect()
                except Exception as disconnect_error:
                    logger.error(
                        f'Error during disconnect after failed connection: {str(disconnect_error)}'
                    )

    return mcp_clients


async def fetch_mcp_tools_from_config(mcp_config: MCPConfig) -> list[dict]:
    """
    Retrieves the list of MCP tools from the MCP clients.

    Returns:
        A list of tool dictionaries. Returns an empty list if no connections could be established.
    """
    mcp_clients = []
    mcp_tools = []
    try:
        logger.debug(f'Creating MCP clients with config: {mcp_config}')
        mcp_clients = await create_mcp_clients(
            mcp_config.mcp_servers,
        )

        if not mcp_clients:
            logger.debug('No MCP clients were successfully connected')
            return []

        mcp_tools = convert_mcp_clients_to_tools(mcp_clients)

        # Always disconnect clients to clean up resources
        for mcp_client in mcp_clients:
            try:
                await mcp_client.disconnect()
            except Exception as disconnect_error:
                logger.error(f'Error disconnecting MCP client: {str(disconnect_error)}')
    except Exception as e:
        logger.error(f'Error fetching MCP tools: {str(e)}')
        return []

    logger.debug(f'MCP tools: {mcp_tools}')
    return mcp_tools


async def call_tool_mcp(mcp_clients: list[MCPClient], action: McpAction) -> Observation:
    """
    Call a tool on an MCP server and return the observation.

    Args:
        action: The MCP action to execute
        sse_mcp_servers: List of SSE MCP server URLs

    Returns:
        The observation from the MCP server
    """
    if not mcp_clients:
        raise ValueError('No MCP clients found')

    logger.debug(f'MCP action received: {action}')
    # Find the MCP agent that has the matching tool name
    matching_client = None
    logger.debug(f'MCP clients: {mcp_clients}')
    logger.debug(f'MCP action name: {action.name}')
    for client in mcp_clients:
        logger.debug(f'MCP client tools: {client.tools}')
        if action.name in [tool.name for tool in client.tools]:
            matching_client = client
            break
    if matching_client is None:
        raise ValueError(f'No matching MCP agent found for tool name: {action.name}')
    logger.debug(f'Matching client: {matching_client}')
    args_dict = json.loads(action.arguments) if action.arguments else {}
    response = await matching_client.call_tool(action.name, args_dict)
    logger.debug(f'MCP response: {response}')

    return MCPObservation(content=f'MCP result:{response.model_dump(mode="json")}')
