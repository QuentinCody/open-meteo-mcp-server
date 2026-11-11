/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import { z } from "zod";
import { hashCanonicalJson, verifyCitationEnvelope } from "@bio-mcp/shared";
import { DynamicWorkerExecutor } from "@bio-mcp/shared/codemode/execute-tool";
vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
import { MeteoDataDO } from "../do";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function createStore() {
  const database = new DatabaseSync(":memory:");
  let ready = Promise.resolve();
  const exec = (query: string, ...values: any[]) => {
    const rows = database.prepare(query).all(...values);
    const iterator = rows[Symbol.iterator]();
    return { toArray: () => rows, one: () => rows[0], next: () => iterator.next(), [Symbol.iterator]: () => iterator };
  };
  const transactionSync = <T>(run: () => T): T => {
    database.exec("BEGIN");
    try { const result = run(); database.exec("COMMIT"); return result; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  };
  const ctx = { blockConcurrencyWhile: (run: () => Promise<void>) => { ready = run(); return ready; }, storage: { sql: { exec }, transactionSync } };
  const instance = new MeteoDataDO(ctx as unknown as DurableObjectState, {} as Cloudflare.Env);
  return { database, instance, ready };
}

function fixture() {
  // Exercise generated API helpers and user code; replace only the platform isolate.
  vi.spyOn(DynamicWorkerExecutor.prototype, "execute").mockImplementation(async (code, functions) => {
    const staged: Array<Record<string, unknown>> = [];
    try {
      const run = new Function("codemode", "__stagedResults", "console", `return (${code})();`);
      const result = await run(functions, staged, { warn() {}, log() {} });
      return { result: JSON.parse(JSON.stringify(result)), __stagedResults: staged };
    } catch (error) { return { error: String((error as Error).message), __stagedResults: staged }; }
  });
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const namespace = { idFromName: (name: string) => name, get: (id: string) => ({ fetch: async (request: Request) => {
    let store = stores.get(id);
    if (!store) { store = createStore(); stores.set(id, store); }
    await store.ready;
    return store.instance.fetch(request);
  } }) };
  const env = { METEO_DATA_DO: namespace, CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1];
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, env); registerQueryData(server, env); registerGetSchema(server, env);
  const tools = (server as unknown as { _registeredTools: Record<string, { inputSchema: z.ZodType; handler: (args: unknown, extra: unknown) => Promise<any> }> })._registeredTools;
  return { tools, close: () => { for (const store of stores.values()) store.database.close(); } };
}

async function recover(f: ReturnType<typeof fixture>, id: string, prefix: string) {
  const rows = async (sql: string) => {
    const output = await f.tools[`${prefix}meteo_query_data`].handler({ data_access_id: id, sql }, {});
    expect(output.isError, JSON.stringify(output)).not.toBe(true);
    expect(output.structuredContent.staged).not.toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(output)).byteLength).toBeLessThan(30720);
    return output.structuredContent.data.rows;
  };
  const text = async (table: string, column: string, where: string) => {
    const [{ n }] = await rows(`SELECT length(${column}) AS n FROM ${table} WHERE ${where}`);
    let result = "";
    for (let start = 1; start <= n; start += 1000) {
      const [row] = await rows(`SELECT substr(${column}, ${start}, 1000) AS part FROM ${table} WHERE ${where}`);
      result += row.part;
    }
    return result;
  };
  let raw = await text("payloads", "root_json", "id = 1");
  if (raw.startsWith("__CHUNKED__:")) {
    const chunk = raw.slice("__CHUNKED__:".length);
    expect(chunk).toMatch(/^chunk_[a-f0-9]{32}$/);
    const parts = await rows(`SELECT chunk_index FROM content_chunks WHERE content_id = '${chunk}' ORDER BY chunk_index`);
    raw = "";
    for (const part of parts) raw += await text("content_chunks", "chunk_data", `content_id = '${chunk}' AND chunk_index = ${part.chunk_index}`);
  }
  const decoded = JSON.parse(raw);
  return typeof decoded === "string" ? JSON.parse(decoded) : decoded;
}

const bytes = (data: unknown) => new TextEncoder().encode(JSON.stringify(data)).byteLength;
it("verifies failed SQL citations against caller arguments when the limit is omitted", async () => {
  const f = fixture();
  try {
    for (const prefix of ["", "mcp_"]) {
      const args = {data_access_id: "meteo_fixture", sql: "DELETE FROM payloads"};
      const tool = f.tools[`${prefix}meteo_query_data`];
      const parsed = tool.inputSchema.parse(args);
      const result = await tool.handler(parsed, {});
      expect(result.isError).toBe(true);
      const checked = await verifyCitationEnvelope({citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: args});
      expect(checked.verification).toMatchObject({query: "verified", result: "verified"});
    }
  } finally { f.close(); }
});
it("stages composed and SQL envelopes with verifiable citations and both error fields", async () => {
  const f = fixture();
  try {
    for (const prefix of ["", "mcp_"]) {
      const args = {code: "return {text: 'α'.repeat(20000)};"};
      const result = await f.tools[`${prefix}meteo_execute`].handler(args, {});
      expect(bytes(result)).toBeLessThan(30720); expect(result.structuredContent._staging).toBeDefined();
      const id = result.structuredContent.data_access_id;
      const full = await recover(f, id, prefix); expect(full.structuredContent.data.text).toBe("α".repeat(20000));
      const verified = await verifyCitationEnvelope({citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: args, materialized: {value: full}});
      expect(verified.verification).toMatchObject({query: "verified", result: "verified", quarantined: false});
      const sql = {data_access_id: id, sql: "SELECT replace(hex(zeroblob(40000)), '00', 'x') AS value"};
      const query = await f.tools[`${prefix}meteo_query_data`].handler(sql, {});
      expect(query.structuredContent._staging).toBeDefined(); expect(bytes(query)).toBeLessThan(30720);
      const stored = await recover(f, query.structuredContent.data_access_id, prefix);
      expect(stored.structuredContent.data.rows[0].value).toBe("x".repeat(40000));
      const failed = await f.tools[`${prefix}meteo_query_data`].handler({data_access_id: id, sql: "DELETE FROM payloads"}, {});
      expect(failed).toMatchObject({isError: true, content: expect.any(Array), structuredContent: {success: false}});
    }
  } finally { f.close(); }
});

it("recovers complete archive axes, nulls, model units and exact source evidence from production staging", async () => {
  const f = fixture();
  const native = {latitude: 52.55, longitude: 13.4, utc_offset_seconds: 7200, timezone: "Europe/Berlin",
    hourly: {time: ["2026-09-23T02:00"], temperature_2m_ecmwf_ifs: [null], temperature_2m_gfs_global: [9.2]},
    hourly_units: {time: "iso8601", temperature_2m_ecmwf_ifs: "°C", temperature_2m_gfs_global: "°C"},
    extra_provider_metadata: "λ".repeat(65000)};
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(native)));
  try {
    for (const prefix of ["", "mcp_"]) {
      const args = {code: "return await api.get('/v1/single-run',{latitude:52.52,longitude:13.41,run:'2026-09-23T00:00',models:'ecmwf_ifs,gfs_global',hourly:'temperature_2m',timezone:'Europe/Berlin'});"};
      const result = await f.tools[`${prefix}meteo_execute`].handler(args, {});
      expect(result.isError, JSON.stringify(result)).not.toBe(true); expect(bytes(result)).toBeLessThan(30720);
      const data = await recover(f, result.structuredContent.data.data_access_id, prefix);
      expect(data.data).toEqual(native);
      expect(data.provenance).toMatchObject({initialization_time_utc: "2026-09-23T00:00:00Z", public_availability_time: null, model_version: null, upstream_run_identity_verified: false});
      expect(result.structuredContent._meta.citation.result_hash).toBe(await hashCanonicalJson(data));
      const checked = await verifyCitationEnvelope({citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: args, materialized: {value: data}});
      expect(checked.verification).toMatchObject({query: "verified", result: "verified"});
    }
  } finally { f.close(); }
});
it("retains large native provider errors on both execution aliases", async () => {
  const f = fixture();
  const native = {error: true, reason: "λ".repeat(20000)};
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(native, {status: 400})));
  try {
    for (const prefix of ["", "mcp_"]) for (const code of [
      "return await api.get('/v1/single-run',{latitude:52.52,longitude:13.41,run:'2026-09-23T00:00',models:'bad_model',hourly:'temperature_2m'});",
      "return await api.get('/v1/forecast',{latitude:52.52,longitude:13.41});",
    ]) {
      const result = await f.tools[`${prefix}meteo_execute`].handler({code}, {});
      expect(result).toMatchObject({isError: true, content: expect.any(Array), structuredContent: {success: false}});
      expect(bytes(result)).toBeLessThan(30720);
      const sc = result.structuredContent;
      const full = sc.staged ? (await recover(f, sc.data_access_id, prefix)).structuredContent : sc;
      const detail = full.data;
      const evidence = detail.data?.__staged ? await recover(f, detail.data.data_access_id, prefix) : detail.data;
      expect(detail.status).toBe(400); expect(evidence.provider_response).toEqual(native);
      expect(evidence.response_sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  } finally { f.close(); }
});
