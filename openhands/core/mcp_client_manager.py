import asyncio
from typing import Dict, Any, List, Optional
from openhands.core.mcp_client import MCPClient
from openhands.core.config.mcp_config import MCPConfig

class MCPClientManager:
    """
    Loads configuration, manages MCPClient instances, aggregates discovered tools/resources/prompts,
    and routes invocation requests.
    """

    def __init__(self, config: MCPConfig):
        self.config = config
        self.clients: Dict[str, MCPClient] = {}
        self.tools: Dict[str, Dict[str, Any]] = {}
        self.resources: Dict[str, Dict[str, Any]] = {}
        self.prompts: Dict[str, Dict[str, Any]] = {}

    async def initialize(self):
        """
        Initialize all MCPClient instances and perform discovery.
        """
        for idx, url in enumerate(self.config.mcp_servers):
            name = f"mcp_server_{idx}"
            # For now, assume all are SSE; extend as needed for stdio
            client = MCPClient(name=name, url=url, transport="sse")
            await client.connect()
            await client.discover()
            self.clients[name] = client
            self._aggregate_discovery(client)

    def _aggregate_discovery(self, client: MCPClient):
        # Aggregate tools/resources/prompts from all clients
        for tool_name, tool in client.tools.items():
            self.tools[f"{client.name}:{tool_name}"] = tool
        for res_name, res in client.resources.items():
            self.resources[f"{client.name}:{res_name}"] = res
        for prompt_name, prompt in client.prompts.items():
            self.prompts[f"{client.name}:{prompt_name}"] = prompt

    def get_tool(self, qualified_name: str) -> Optional[Dict[str, Any]]:
        return self.tools.get(qualified_name)

    def get_resource(self, qualified_name: str) -> Optional[Dict[str, Any]]:
        return self.resources.get(qualified_name)

    def get_prompt(self, qualified_name: str) -> Optional[Dict[str, Any]]:
        return self.prompts.get(qualified_name)

    async def invoke(self, qualified_name: str, arguments: Dict[str, Any]) -> Any:
        """
        Route invocation to the correct MCPClient based on qualified tool/resource/prompt name.
        """
        if ":" not in qualified_name:
            raise ValueError("Qualified name must be in the form 'client:tool'")
        client_name, tool_name = qualified_name.split(":", 1)
        client = self.clients.get(client_name)
        if not client:
            raise ValueError(f"No MCPClient found for {client_name}")
        return await client.invoke(tool_name, arguments)

    async def close(self):
        for client in self.clients.values():
            await client.close()

    async def reload(self):
        """
        Reload all MCPClient instances and re-discover tools/resources/prompts.
        """
        await self.close()
        self.clients.clear()
        self.tools.clear()
        self.resources.clear()
        self.prompts.clear()
        await self.initialize()