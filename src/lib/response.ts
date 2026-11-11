export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message.slice(0, 2000)), {status});
}

/** Bound both successful payloads and native provider error evidence. */
export async function readMeteoJson(url: URL) {
  const response = await fetch(url, {headers: {Accept: "application/json"}, signal: AbortSignal.timeout(50_000), redirect: "manual"});
  const reader = response.body?.getReader();
  if (!reader) fail("Empty Open-Meteo response", 502);
  const decoder = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true});
  let raw = ""; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4 * 1024 * 1024) fail("Open-Meteo response exceeds 4 MiB; narrow locations, dates or variables", 502);
      raw += decoder.decode(chunk.value, {stream: true});
    }
    raw += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const response_sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  let data: unknown = raw;
  try { data = JSON.parse(raw.replace(/^\uFEFF/, "")); } catch {
    if (response.ok) throw Object.assign(new Error("Invalid Open-Meteo JSON"), {status: 502, data: {provider_response: raw, source_url: url.toString(), response_sha256}});
  }
  if (!response.ok) throw Object.assign(new Error(`Open-Meteo HTTP ${response.status}; inspect provider_response for model, parameter or availability details`), {status: response.status, data: {provider_response: data, source_url: url.toString(), response_sha256}});
  return {data, status: response.status, response_sha256};
}
