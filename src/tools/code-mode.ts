import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { meteoCatalog } from "../spec/catalog";
import { createMeteoApiFetch } from "../lib/api-adapter";
import { meteoResponse } from "../lib/tool-result";

interface CodeModeEnv {
    METEO_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
    const apiFetch = createMeteoApiFetch();
    const registrar = {tool: (...args: unknown[]) => {
        const [name, ...rest] = args;
        const handler = rest.pop() as (args: unknown, extra: unknown) => ReturnType<Parameters<typeof meteoResponse>[0]>;
        const respond = (args: unknown, extra: unknown) => meteoResponse(() => handler(args, extra), env, String(name), extra, args);
        const register = server.tool.bind(server) as (...values: unknown[]) => void;
        register(name, ...rest, respond); register(`mcp_${String(name)}`, ...rest, respond);
    }};

    const searchTool = createSearchTool({
        prefix: "meteo",
        catalog: meteoCatalog,
    });
    searchTool.register(registrar);

    const executeTool = createExecuteTool({
        prefix: "meteo",
        // Verifiable provenance: meteo_execute results carry a _meta.citation.
        source: { id: "meteo", name: "Open-Meteo", url: "https://open-meteo.com", license: "Data: CC BY 4.0. Free API: non-commercial use only; commercial use needs an Open-Meteo subscription" },
        catalog: meteoCatalog,
        apiFetch,
        maxInlineBytes: 30 * 1024,
        stagingThreshold: 30 * 1024,
        preserveApiErrors: true,
        timeout: 90_000,
        doNamespace: env.METEO_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(registrar);
}
