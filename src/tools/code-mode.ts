import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { meteoCatalog } from "../spec/catalog";
import { createMeteoApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
    METEO_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
    const apiFetch = createMeteoApiFetch();

    const searchTool = createSearchTool({
        prefix: "meteo",
        catalog: meteoCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    const executeTool = createExecuteTool({
        prefix: "meteo",
        catalog: meteoCatalog,
        apiFetch,
        doNamespace: env.METEO_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
