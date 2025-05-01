from typing import Dict, Any, Callable, Optional, List, Union
from openhands.core.mcp_client_manager import MCPClientManager

class ToolRegistry:
    """
    Registers all available tools/resources/prompts (local and remote),
    provides lookup, and dispatches invocations to the correct handler.
    """

    def __init__(self, mcp_manager: MCPClientManager):
        self.mcp_manager = mcp_manager
        self.local_tools: Dict[str, Callable[[Dict[str, Any]], Any]] = {}
        self.local_resources: Dict[str, Callable[[Dict[str, Any]], Any]] = {}
        self.local_prompts: Dict[str, Callable[[Dict[str, Any]], Any]] = {}

    def register_local_tool(self, name: str, handler: Callable[[Dict[str, Any]], Any]):
        self.local_tools[name] = handler

    def register_local_resource(self, name: str, handler: Callable[[Dict[str, Any]], Any]):
        self.local_resources[name] = handler

    def register_local_prompt(self, name: str, handler: Callable[[Dict[str, Any]], Any]):
        self.local_prompts[name] = handler

    def list_tools(self) -> List[str]:
        return list(self.local_tools.keys()) + list(self.mcp_manager.tools.keys())

    def list_resources(self) -> List[str]:
        return list(self.local_resources.keys()) + list(self.mcp_manager.resources.keys())

    def list_prompts(self) -> List[str]:
        return list(self.local_prompts.keys()) + list(self.mcp_manager.prompts.keys())

    def get_tool(self, name: str) -> Optional[Union[Callable, Dict[str, Any]]]:
        if name in self.local_tools:
            return self.local_tools[name]
        return self.mcp_manager.get_tool(name)

    def get_resource(self, name: str) -> Optional[Union[Callable, Dict[str, Any]]]:
        if name in self.local_resources:
            return self.local_resources[name]
        return self.mcp_manager.get_resource(name)

    def get_prompt(self, name: str) -> Optional[Union[Callable, Dict[str, Any]]]:
        if name in self.local_prompts:
            return self.local_prompts[name]
        return self.mcp_manager.get_prompt(name)

    async def invoke(self, name: str, arguments: Dict[str, Any]) -> Any:
        if name in self.local_tools:
            return self.local_tools[name](arguments)
        if name in self.local_resources:
            return self.local_resources[name](arguments)
        if name in self.local_prompts:
            return self.local_prompts[name](arguments)
        # Otherwise, try remote via MCP
        return await self.mcp_manager.invoke(name, arguments)