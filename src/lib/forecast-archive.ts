import { fail, readMeteoJson } from "./response";
export { fail } from "./response";
export type ArchiveKind = "historical_forecast" | "single_run";
const HOSTS = {historical_forecast: "https://historical-forecast-api.open-meteo.com", single_run: "https://single-runs-api.open-meteo.com"};
const GROUPS = ["hourly", "daily", "minutely_15"] as const;
const OPTIONS = ["latitude", "longitude", "models", ...GROUPS, "start_date", "end_date", "run", "timezone", "timeformat", "temperature_unit", "wind_speed_unit", "precipitation_unit", "elevation", "cell_selection", "tilt", "azimuth", "forecast_days", "forecast_hours", "past_days", "past_hours", "forecast_minutely_15", "past_minutely_15", "start_hour", "end_hour", "start_minutely_15", "end_minutely_15", "temporal_resolution"];
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Invalid Open-Meteo response object", 502);
  return value as Record<string, unknown>;
}
function date(value: unknown, withTime = false): number {
  const pattern = withTime ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (typeof value !== "string" || !pattern.test(value)) fail(withTime ? "Use YYYY-MM-DDTHH:mm without seconds or timezone suffix; run is UTC" : "Use YYYY-MM-DD dates");
  const ms = Date.parse(value + (withTime ? ":00Z" : "T00:00:00Z"));
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, withTime ? 16 : 10) !== value) fail("Invalid calendar date/time");
  return ms;
}
function list(value: unknown, name: string, max: number): string[] {
  if (typeof value !== "string" || !value || value.length > 3000) fail(`${name} must be a comma-separated string`);
  const values = value.split(",");
  if (values.length > max || new Set(values).size !== values.length || values.some(v => !/^[a-zA-Z0-9_]+$/.test(v))) fail(`Select 1–${max} distinct ${name} codes`);
  return values;
}
function coordinates(value: unknown, max: number): number[] {
  if (typeof value !== "string" && typeof value !== "number") fail("Coordinates must be numbers or comma-separated numbers");
  const pieces = String(value).split(",");
  const values = pieces.map(Number);
  if (values.length > 10 || pieces.some(v => !v.trim()) || values.some(v => !Number.isFinite(v) || Math.abs(v) > max)) fail("Supply 1–10 valid coordinates with matching latitude/longitude counts");
  return values;
}
export function archiveRequest(kind: ArchiveKind, input: Record<string, unknown>) {
  const { params, latitudes } = validateArchiveParams(input, kind);
  for (const [start, end, withTime] of [["start_date", "end_date", false], ["start_hour", "end_hour", true], ["start_minutely_15", "end_minutely_15", true]] as const) {
    if (params[start] === undefined && params[end] === undefined) continue;
    const first = date(params[start], withTime); const last = date(params[end], withTime);
    if (last < first || last - first > 365 * 86400000) fail("Select an ordered window of at most 366 days; batch longer ranges");
  }
  const bounds: Record<string, number> = {forecast_days: 16, past_days: 92, forecast_hours: 384, past_hours: 2208, forecast_minutely_15: 1536, past_minutely_15: 8832};
  for (const [key, max] of Object.entries(bounds)) if (params[key] !== undefined) {
    const value = Number(params[key]);
    if (!Number.isSafeInteger(value) || value < 0 || value > max) fail(`${key} must be an integer from 0 to ${max}`);
  }
  const url = new URL("/v1/forecast", HOSTS[kind]);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return {url, params, locationCount: latitudes.length};
}
function validateArchiveParams(input: Record<string, unknown>, kind: string) {
  const params = { ...input };
  for (const [key, value] of Object.entries(params)) {
    if (!OPTIONS.includes(key)) fail(`Unsupported archive parameter ${key}`);
    if (!["number", "string"].includes(typeof value) || typeof value === "number" && !Number.isFinite(value) || String(value).length > 3000) fail(`Invalid archive parameter ${key}`);
  }
  const latitudes = coordinates(params.latitude, 90);
  const longitudes = coordinates(params.longitude, 180);
  if (latitudes.length !== longitudes.length) fail("Latitude and longitude counts must match");
  let variableCount = 0;
  for (const group of GROUPS) if (params[group] !== undefined) variableCount += list(params[group], group, 20).length;
  if (!variableCount || variableCount > 30) fail("Select 1–30 total hourly/daily/minutely_15 variables");
  if (params.models !== undefined) list(params.models, "models", 5);
  params.timezone ??= "GMT";
  params.timeformat ??= "iso8601";
  if (!["iso8601", "unixtime"].includes(String(params.timeformat))) fail("timeformat must be iso8601 or unixtime");
  if (kind === "single_run") {
    for (const key of ["start_date", "end_date", "start_hour", "end_hour", "start_minutely_15", "end_minutely_15"]) if (params[key] !== undefined) fail(`Single Runs rejects ${key}; select forecast_days, forecast_hours or forecast_minutely_15 from the requested run`);
    date(params.run, true);
    if (params.models === undefined) fail("Select explicit models for a single run");
  } else {
    if (params.run !== undefined) fail("Historical Forecast is stitched data; use /v1/single-run for a run");
    if (params.start_date === undefined || params.end_date === undefined) fail("Historical Forecast requires start_date and end_date");
  }
  return { params, latitudes };
}

export function validateArchiveData(data: unknown, params: Record<string, unknown>, locationCount: number) {
  const locations = Array.isArray(data) ? data : [data];
  if (locations.length !== locationCount) fail("Open-Meteo location count mismatch", 502);
  for (const value of locations) {
    const location = object(value);
    if (location.error === true) fail(typeof location.reason === "string" ? location.reason : "Open-Meteo error", 502);
    if (typeof location.latitude !== "number" || typeof location.longitude !== "number" || typeof location.utc_offset_seconds !== "number" || typeof location.timezone !== "string") fail("Open-Meteo location/timezone metadata unavailable", 502);
    for (const group of GROUPS) {
      if (params[group] === undefined) continue;
      const series = object(location[group]); validateArchiveSeries(location, group, params, series);
    }
  }
}
function validateArchiveSeries(location: Record<string, unknown>, group: string, params: Record<string, unknown>, series: Record<string, unknown>) {
  const units = object(location[`${group}_units`]);
  if (units.time !== params.timeformat) fail(`Open-Meteo ${group} time units disagree with requested encoding`, 502);
  if (!Array.isArray(series.time)) fail(`Missing ${group} time axis`, 502);
  for (const time of series.time) if (params.timeformat === "unixtime" ? typeof time !== "number" || !Number.isFinite(time) : typeof time !== "string" || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(time)) fail(`Invalid ${group} time encoding`, 502);
  for (const [key, values] of Object.entries(series)) {
    if (key === "time") continue;
    if (!Array.isArray(values) || values.length !== series.time.length || typeof units[key] !== "string") fail(`Open-Meteo ${group} values/units mismatch`, 502);
    if (values.some(v => v !== null && typeof v !== "string" && (typeof v !== "number" || !Number.isFinite(v)))) fail(`Invalid ${group} value`, 502);
  }
  for (const variable of String(params[group]).split(",")) {
    const models = params.models === undefined ? [] : String(params.models).split(",");
    const has = (key: string) => Object.prototype.hasOwnProperty.call(series, key);
    if (models.length > 1 ? models.some(model => !has(`${variable}_${model}`)) : !has(variable) && (!models.length || !has(`${variable}_${models[0]}`))) fail(`Requested ${group} variable missing: ${variable}`, 502);
  }
}

export async function archivedForecast(kind: ArchiveKind, input: Record<string, unknown>) {
  const request = archiveRequest(kind, input);
  const {data, response_sha256} = await readMeteoJson(request.url);
  validateArchiveData(data, request.params, request.locationCount);
  return {data, provenance: {dataset: kind, source_url: request.url.toString(), request: request.params, retrieved_at: new Date().toISOString(),
    response_sha256,
    initialization_time_utc: kind === "single_run" ? `${request.params.run}:00Z` : null,
    initialization_time_source: kind === "single_run" ? "request" : null, upstream_run_identity_verified: false,
    public_availability_time: null, model_version: null, complete_forecast_horizon_verified: false},
    note: kind === "single_run" ? "Run is UTC initialization, not publication/availability time. Native valid times, timezone/offset, units, grid coordinates and nulls are preserved. A request does not prove when output became available; avoid backtesting look-ahead. No automatic UTC conversion or lead-time inference." : "Continuous series stitched from early hours of successive forecasts; not a single issue-time forecast or reanalysis. Model versions may change. Native time axes, units, grid coordinates and nulls are preserved; no issue time is inferred."};
}
