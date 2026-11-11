import { shouldStage, stageToDoAndRespond } from "@bio-mcp/shared/staging/utils";
import { buildCitation } from "@bio-mcp/shared";
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

type Result = { content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean; [key: string]: unknown };
type DataEnv = { METEO_DATA_DO?: unknown };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const source = { id: "meteo", name: "Open-Meteo", url: "https://open-meteo.com", license: "Data: CC BY 4.0. Free API: non-commercial use only; commercial use needs an Open-Meteo subscription" };

async function citeUncitedResult(structured: Record<string, unknown>, toolName: string, query: unknown) {
  const meta = isRecord(structured._meta) ? structured._meta : {};
  if (isRecord(meta.citation)) return structured;
  const { _meta: _metadata, ...root } = structured;
  const program = toolName.endsWith("meteo_execute") && isRecord(query) && typeof query.code === "string";
  // Preserve factory citations; other results cite their complete structured root.
  const citation = await buildCitation({ source, server: "meteo", tool: toolName.replace(/^mcp_/, ""), query: program ? query.code : query,
    queryScope: program ? "tool_argument:code" : "tool_arguments", result: root, resultScope: "structured_content:root_without_meta",
    retrievedAt: new Date().toISOString() });
  return { ...structured, _meta: { ...meta, citation } };
}

/** Apply the transport limit to the complete tool envelope, including escaped text. */
export async function meteoResponse(work: () => Promise<Result>, env: DataEnv, toolName: string, extra: unknown, query: unknown): Promise<Result> {
  try {
    const original = await work();
    const structured = original.structuredContent ?? { success: original.isError !== true };
    const apiError = structured.data && typeof structured.data === "object" && "__api_error" in structured.data && structured.data.__api_error === true;
    const failed = original.isError === true || structured.success === false || apiError || Boolean(structured.program_error) || structured.disposition === "partial";
    const cited = await citeUncitedResult(failed ? { ...structured, success: false } : structured, toolName, query);
    const result = { ...original, structuredContent: cited, ...(failed ? { isError: true } : {}) };
    if (!shouldStage(bytes(result))) return result;
    return await stageResponse(env, result, toolName, extra, query, failed);
  } catch {
    const data = { success: false, error: { code: "RESPONSE_ERROR", message: "Open-Meteo response could not be returned." } };
    const citation = await buildCitation({ source, server: "meteo", tool: toolName.replace(/^mcp_/, ""),
      query, queryScope: "tool_arguments", retrievedAt: new Date().toISOString(), result: data, resultScope: "structured_content:root_without_meta" });
    return { content: [{ type: "text", text: data.error.message }], structuredContent: { ...data, _meta: { citation } }, isError: true };
  }
}

async function stageResponse(env: DataEnv, result: Result, toolName: string, extra: unknown, query: unknown, failed: unknown) : Promise<Result> {
  if (!env.METEO_DATA_DO) throw new Error("Missing staging storage");
  const staged = await stageToDoAndRespond(result, env.METEO_DATA_DO as Parameters<typeof stageToDoAndRespond>[1], "meteo", undefined,
    { toolName, serverName: "meteo" }, "meteo", extra as Parameters<typeof stageToDoAndRespond>[6]);
  const citation = await buildCitation({
    source, server: "meteo", tool: toolName.replace(/^mcp_/, ""),
    query, queryScope: "tool_arguments", retrievedAt: new Date().toISOString(), result, resultScope: "staged:full_result", dataAccessId: staged.dataAccessId
  });
  const structuredContent = { success: !failed, staged: true, data: undefined, data_access_id: staged.dataAccessId, _staging: staged._staging, _meta: { citation } };
  if (bytes(structuredContent) > 100000) throw new Error("Staging metadata exceeds transport limit");
  const response = { content: [{ type: "text" as const, text: "Response staged. Use meteo_query_data; payloads retains the complete original response." }], structuredContent, ...(failed ? { isError: true } : {}) };
  if (shouldStage(bytes(response))) throw new Error("Staging metadata exceeds inline limit");
  return response;
}
