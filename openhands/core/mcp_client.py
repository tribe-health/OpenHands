import asyncio
from typing import Any, Dict, List, Optional, Callable, Union
import aiohttp
import subprocess
import json

class MCPClient:
    """
    Handles connection, handshake, discovery, and invocation for a single MCP server.
    Supports both stdio (local) and SSE (remote) transports.
    """

    def __init__(
        self,
        name: str,
        url: str,
        transport: str = "sse",
        auth: Optional[Dict[str, Any]] = None,
        on_discovery: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.name = name
        self.url = url
        self.transport = transport
        self.auth = auth
        self.on_discovery = on_discovery
        self.session = None
        self.proc = None
        self.tools: Dict[str, Dict[str, Any]] = {}
        self.resources: Dict[str, Dict[str, Any]] = {}
        self.prompts: Dict[str, Dict[str, Any]] = {}

    async def connect(self):
        if self.transport == "sse":
            self.session = aiohttp.ClientSession()
            # Optionally handle authentication headers here
        elif self.transport == "stdio":
            self.proc = await asyncio.create_subprocess_exec(
                *self.url.split(),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        else:
            raise ValueError(f"Unsupported transport: {self.transport}")

    async def discover(self):
        """
        Perform handshake and discovery with the MCP server.
        Populates self.tools, self.resources, self.prompts.
        """
        if self.transport == "sse":
            async with self.session.get(f"{self.url}/discovery") as resp:
                data = await resp.json()
                self._handle_discovery(data)
        elif self.transport == "stdio":
            # Send discovery command via stdio
            self.proc.stdin.write(b'{"type": "discovery"}\n')
            await self.proc.stdin.drain()
            line = await self.proc.stdout.readline()
            data = json.loads(line.decode())
            self._handle_discovery(data)
        else:
            raise ValueError(f"Unsupported transport: {self.transport}")

    def _handle_discovery(self, data: Dict[str, Any]):
        self.tools = {tool["name"]: tool for tool in data.get("tools", [])}
        self.resources = {res["name"]: res for res in data.get("resources", [])}
        self.prompts = {prompt["name"]: prompt for prompt in data.get("prompts", [])}
        if self.on_discovery:
            self.on_discovery(data)

    async def invoke(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """
        Invoke a tool/resource/prompt on the MCP server.
        """
        if self.transport == "sse":
            async with self.session.post(
                f"{self.url}/invoke/{tool_name}", json=arguments
            ) as resp:
                return await resp.json()
        elif self.transport == "stdio":
            req = json.dumps({"type": "invoke", "tool": tool_name, "arguments": arguments})
            self.proc.stdin.write((req + "\n").encode())
            await self.proc.stdin.drain()
            line = await self.proc.stdout.readline()
            return json.loads(line.decode())
        else:
            raise ValueError(f"Unsupported transport: {self.transport}")

    async def close(self):
        if self.session:
            await self.session.close()
        if self.proc:
            self.proc.terminate()
            await self.proc.wait()