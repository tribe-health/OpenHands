import React, { useEffect, useState } from "react";

/**
 * MCP Server type definition.
 */
interface McpServer {
  name: string;
  status: "online" | "offline" | "unknown";
  enabled: boolean;
}

/**
 * Placeholder: Replace with real API call to fetch MCP servers.
 * Backend requirement: Provide an endpoint to GET all MCP servers with their name, status, and enabled state.
 */
async function fetchMcpServers(): Promise<McpServer[]> {
  // TODO: Replace with real API call.
  return [
    { name: "server-1", status: "online", enabled: true },
    { name: "server-2", status: "offline", enabled: false },
    { name: "server-3", status: "unknown", enabled: true },
  ];
}

/**
 * Placeholder: Replace with real API call to update enabled state.
 * Backend requirement: Provide an endpoint to PATCH/PUT the enabled state of a given MCP server.
 */
async function setMcpServerEnabled(name: string, enabled: boolean): Promise<void> {
  // TODO: Replace with real API call.
  return;
}

export function McpServerManager() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const [reloading, setReloading] = useState(false);
  const [reloadStatus, setReloadStatus] = useState<null | "success" | "error">(null);
  const [reloadError, setReloadError] = useState<string | null>(null);

  /**
   * Call backend to reload all MCP servers.
   * Backend requirement: Provide POST /api/mcp/reload endpoint.
   */
  async function reloadMcpServers() {
    setReloading(true);
    setReloadStatus(null);
    setReloadError(null);
    try {
      const resp = await fetch("/api/mcp/reload", { method: "POST" });
      const data = await resp.json();
      if (data.success) {
        setReloadStatus("success");
        // Optionally, re-fetch the server list after reload
        setLoading(true);
        fetchMcpServers()
          .then(setServers)
          .catch(() => setError("Failed to load MCP servers."))
          .finally(() => setLoading(false));
      } else {
        setReloadStatus("error");
        setReloadError(data.error || "Unknown error");
      }
    } catch (e: any) {
      setReloadStatus("error");
      setReloadError(e?.message || "Unknown error");
    } finally {
      setReloading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchMcpServers()
      .then(setServers)
      .catch(() => setError("Failed to load MCP servers."))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (name: string, enabled: boolean) => {
    setUpdating((prev) => ({ ...prev, [name]: true }));
    try {
      await setMcpServerEnabled(name, enabled);
      setServers((prev) =>
        prev.map((s) => (s.name === name ? { ...s, enabled } : s))
      );
    } catch {
      setError("Failed to update server state.");
    } finally {
      setUpdating((prev) => ({ ...prev, [name]: false }));
    }
  };

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-2">MCP Servers</h3>
      {/* Reload MCP Servers Button */}
      <button
        type="button"
        className="mb-2 mr-2 px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-60"
        onClick={reloadMcpServers}
        disabled={reloading}
        title="Reload all MCP servers from config"
      >
        {reloading ? "Reloading..." : "Reload MCP Servers"}
      </button>
      {reloadStatus === "success" && (
        <span className="ml-2 text-green-700 text-sm">Reloaded successfully.</span>
      )}
      {reloadStatus === "error" && (
        <span className="ml-2 text-red-700 text-sm">
          Reload failed: {reloadError}
        </span>
      )}
      {/* Edit MCP Server Config Button */}
      <button
        type="button"
        className="mb-3 px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition"
        onClick={() => {
          // TODO: Implement backend or VSCode extension support to open the MCP config file in the user's editor.
          // This requires a backend API or VSCode extension command that opens the config file (default: config.toml) in the user's VSCode.
          // See OpenHands issue: "Allow editing global MCP config from settings UI".
          // For now, this is a placeholder.
          alert(
            "Opening the MCP Server config file in VSCode is not yet supported. " +
              "This requires backend or extension support to open the config file (e.g., config.toml) in your editor."
          );
        }}
      >
        Edit MCP Server Config
      </button>
      {loading ? (
        <div>Loading MCP servers...</div>
      ) : error ? (
        <div className="text-danger">{error}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-1">Name</th>
              <th className="text-left py-1">Status</th>
              <th className="text-left py-1">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <tr key={server.name}>
                <td className="py-1">{server.name}</td>
                <td className="py-1">
                  <span
                    className={
                      server.status === "online"
                        ? "text-green-600"
                        : server.status === "offline"
                        ? "text-red-600"
                        : "text-gray-500"
                    }
                  >
                    {server.status}
                  </span>
                </td>
                <td className="py-1">
                  <label className="sr-only" htmlFor={`mcp-enabled-${server.name}`}>
                    {`Enable ${server.name}`}
                  </label>
                  <input
                    id={`mcp-enabled-${server.name}`}
                    type="checkbox"
                    checked={server.enabled}
                    disabled={updating[server.name]}
                    onChange={(e) => handleToggle(server.name, e.target.checked)}
                    title={`Enable ${server.name}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="text-xs text-gray-500 mt-2">
        Changes are persisted immediately. Backend API required for real data.
        <br />
        <span className="text-blue-700">
          Editing the MCP Server config file requires backend or extension support to open the config file in your editor.
        </span>
      </div>
    </div>
  );
}