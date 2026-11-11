import {afterEach, expect, it, vi} from "vitest";
import {readMeteoJson} from "./response";
import {createMeteoApiFetch} from "./api-adapter";
afterEach(() => vi.unstubAllGlobals());
const url = new URL("https://single-runs-api.open-meteo.com/v1/forecast");
const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), b => b.toString(16).padStart(2, "0")).join("");
it("hashes exact native UTF-8 including BOM and whitespace while retaining every JSON field", async () => {
  const raw = '\uFEFF { "note": "λ", "null": null }\n';
  const bytes = new TextEncoder().encode(raw);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({start(controller) {for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close();}}))));
  expect(await readMeteoJson(url)).toEqual({data: {note: "λ", null: null}, status: 200, response_sha256: await digest(raw)});
});
it.each([400, 429, 503])("retains native status %s and exact error evidence with a bounded summary", async status => {
  const raw = JSON.stringify({error: true, reason: "λ".repeat(20000)});
  const expectedHash = await digest(raw);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(raw, {status})));
  await expect(readMeteoJson(url)).rejects.toMatchObject({status, data: {provider_response: JSON.parse(raw), source_url: url.toString(), response_sha256: expectedHash}});
});
it("retains invalid JSON and HTML evidence without treating a successful HTTP status as data", async () => {
  const raw = "<html>provider failed</html>";
  const expectedHash = await digest(raw);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(raw)));
  await expect(readMeteoJson(url)).rejects.toMatchObject({status: 502, data: {provider_response: raw, response_sha256: expectedHash}});
});
it("bounds legacy response reads and refuses redirects", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(4 * 1024 * 1024 + 1))));
  await expect(createMeteoApiFetch()({method: "GET", path: "/v1/forecast", params: {latitude: 52.52, longitude: 13.41}})).rejects.toThrow("4 MiB");
  expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({redirect: "manual"});
});
