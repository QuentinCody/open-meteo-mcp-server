import {afterEach, expect, it, vi} from "vitest";
import {McpServer} from "@bio-mcp/shared/mcp";
import {createApiProxyTool} from "@bio-mcp/shared/tools/api-proxy";
import {registerCodeMode} from "./code-mode";
import {registerGetSchema} from "./get-schema";
import {registerQueryData} from "./query-data";
import {meteoCatalog} from "../spec/catalog";
import {archiveWorkflows} from "../spec/forecast-archive";
import {createMeteoApiFetch} from "../lib/api-adapter";
import fixture from "../lib/single-run.fixture.json";
const json = (data: unknown) => new Response(JSON.stringify(data), {headers: {"content-type": "application/json"}});
afterEach(() => vi.unstubAllGlobals());
it("registers both aliases with discoverable recipes and both-field errors", async () => {
  const server = new McpServer({name: "fixture", version: "1"});
  registerCodeMode(server, {CODE_MODE_LOADER: {get: () => ({})}} as unknown as Parameters<typeof registerCodeMode>[1]);
  registerQueryData(server, {}); registerGetSchema(server, {});
  const tools = (server as unknown as {_registeredTools: Record<string, {handler: (args: unknown, extra: unknown) => Promise<unknown>}>})._registeredTools;
  for (const suffix of ["search", "execute", "query_data", "get_schema"]) {
    expect(tools[`meteo_${suffix}`]).toBeDefined(); expect(tools[`mcp_meteo_${suffix}`]).toBeDefined();
  }
  expect(await tools.meteo_search.handler({query: "single run", category: "workflows", max_results: 5}, {})).toMatchObject({content: expect.any(Array), structuredContent: {success: true}});
  expect(await tools.mcp_meteo_query_data.handler({data_access_id: "meteo_fixture", sql: "SELECT 1"}, {})).toMatchObject({isError: true, content: expect.any(Array), structuredContent: expect.any(Object)});
});
it("stages all valid times/values and request initialization context above 30 KiB", async () => {
  const raw = {...fixture.response, extra_provider_metadata: "α".repeat(18000)};
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => json(raw)));
  const stored: unknown[] = [];
  const namespace = {idFromName: (name: string) => name, get: () => ({fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      stored.push((await request.json() as {data: unknown}).data);
      return json({success: true, tables_created: ["hourly"], total_rows: 168, input_rows: 168, table_row_counts: {hourly: 168}});
    }
    return json({success: true, schema: {tables: {hourly: {columns: [{name: "temperature_2m"}]}}}});
  }})} as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({apiFetch: createMeteoApiFetch(), catalog: meteoCatalog, doNamespace: namespace, stagingPrefix: "meteo", maxInlineBytes: 30 * 1024});
  expect(await proxy.handler({method: "GET", path: "/v1/single-run", params: {latitude: 52.52, longitude: 13.41, models: "ecmwf_ifs", run: "2026-09-23T00:00", hourly: "temperature_2m"}}, {sql: () => []})).toMatchObject({__staged: true, data_access_id: expect.any(String)});
  expect(JSON.parse(stored[0] as string)).toMatchObject({data: raw, provenance: {initialization_time_utc: "2026-09-23T00:00:00Z", public_availability_time: null}});
  expect(stored[1]).toMatchObject({data: raw});
});
it.each(archiveWorkflows)("recipe preserves error or staging handles: $title", async workflow => {
  for (const handle of [{__api_error: true}, {__stage_error: true}, {__staged: true, data_access_id: "forecast"}]) {
    const api = {get: vi.fn().mockResolvedValue(handle)};
    expect(await new Function("api", `return (async () => {${workflow.code}})()`)(api)).toEqual(handle);
    expect(api.get).toHaveBeenCalledTimes(1);
  }
});
