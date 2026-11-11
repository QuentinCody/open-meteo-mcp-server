import {afterEach, expect, it, vi} from "vitest";
import {createMeteoApiFetch} from "./api-adapter";
import {archiveRequest, validateArchiveData} from "./forecast-archive";
import fixture from "./single-run.fixture.json";
import historical from "./historical-forecast.fixture.json";
const api = createMeteoApiFetch();
const params = {latitude: 52.52, longitude: 13.41, models: "ecmwf_ifs", run: "2026-09-23T00:00", hourly: "temperature_2m"};
const query = {method: "GET" as const, path: "/v1/single-run", params};
function mock(data: unknown = fixture.response) { vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Response(JSON.stringify(data), {headers: {"content-type": "application/json"}}))); }
afterEach(() => vi.unstubAllGlobals());
it("accepts the provider-linked Single Runs response and preserves its complete data", async () => {
  mock(); const result = await api(query);
  expect(result.data).toMatchObject({data: fixture.response, provenance: {dataset: "single_run", initialization_time_utc: "2026-09-23T00:00:00Z", initialization_time_source: "request", upstream_run_identity_verified: false, public_availability_time: null, model_version: null, complete_forecast_horizon_verified: false, response_sha256: expect.stringMatching(/^[a-f0-9]{64}$/)}});
  expect(fixture.response.hourly.time).toHaveLength(168);
  const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
  expect(url.origin).toBe("https://single-runs-api.open-meteo.com"); expect(url.pathname).toBe("/v1/forecast"); expect(url.searchParams.get("run")).toBe(params.run);
  expect(params).not.toHaveProperty("timezone");
});
it("routes stitched history separately from archive reanalysis and single runs", async () => {
  mock(historical.response);
  const result = await api({method: "GET", path: "/v1/historical-forecast", params: {latitude: 52.52, longitude: 13.41, hourly: "temperature_2m", start_date: "2026-09-08", end_date: "2026-09-22"}});
  expect(result.data).toMatchObject({data: historical.response});
  expect(historical.response.hourly.time).toHaveLength(360);
  expect(result.data).toMatchObject({provenance: {dataset: "historical_forecast", initialization_time_utc: null}});
  expect(new URL(String(vi.mocked(fetch).mock.calls[0][0])).origin).toBe("https://historical-forecast-api.open-meteo.com");
});
it.each(["/v1/forecast", "/v1/archive", "/v1/search", "/v1/ensemble"])("preserves legacy routing %s", async path => {
  mock({legacy: true}); await api({method: "GET", path, params: {latitude: 52.52, longitude: 13.41}});
  const hosts: Record<string, string> = {"/v1/forecast": "api.open-meteo.com", "/v1/archive": "archive-api.open-meteo.com", "/v1/search": "geocoding-api.open-meteo.com", "/v1/ensemble": "ensemble-api.open-meteo.com"};
  expect(new URL(String(vi.mocked(fetch).mock.calls[0][0])).hostname).toBe(hosts[path]);
});
it("preserves null values, timezone/offset and different grid coordinates", async () => {
  const data = {...fixture.response, timezone: "Europe/Berlin", utc_offset_seconds: 7200, hourly: {time: ["2026-09-23T02:00"], temperature_2m: [null]}};
  mock(data); expect((await api({...query, params: {...params, timezone: "Europe/Berlin"}})).data).toMatchObject({data});
});
it("retains unix times and daily string values without computing lead time", async () => {
  const data = {...fixture.response, hourly: {time: [1790121600], temperature_2m: [9]}, hourly_units: {time: "unixtime", temperature_2m: "°C"}, daily: {time: [1790121600], sunrise: [1790140800]}, daily_units: {time: "unixtime", sunrise: "unixtime"}};
  mock(data); expect((await api({...query, params: {...params, daily: "sunrise", timeformat: "unixtime"}})).data).toMatchObject({data});
});
it("preserves multiple locations and model-suffixed variables", async () => {
  const data = {...fixture.response, hourly: {time: ["2026-09-23T00:00"], temperature_2m_ecmwf_ifs: [9], temperature_2m_gfs_global: [null]}, hourly_units: {time: "iso8601", temperature_2m_ecmwf_ifs: "°C", temperature_2m_gfs_global: "°C"}};
  mock([data, {...data, latitude: 40, longitude: -75}]);
  expect((await api({...query, params: {...params, latitude: "52.52,40", longitude: "13.41,-75", models: "ecmwf_ifs,gfs_global"}})).data).toMatchObject({data: [data, {...data, latitude: 40, longitude: -75}]});
});
it.each([
  {run: "2026-02-30T00:00"}, {run: "2026-09-23T00:00Z"}, {run: "2026-09-23T00:00:00"}, {run: "2026-09-23T24:00"}, {run: undefined}, {models: undefined}, {latitude: 91}, {longitude: -181}, {latitude: "52,40"}, {latitude: ""}, {hourly: "temperature_2m,temperature_2m"}, {hourly: "temperature 2m"}, {hourly: undefined}, {forecast_days: 17}, {timeformat: "csv"}, {apikey: "fixture-not-a-secret"}, {url: "https://evil.test"}, {start_date: "2026-01-01", end_date: "2025-12-31"}, {start_date: "2024-01-01", end_date: "2026-01-01"},
])("rejects invalid/broad archive requests before fetching %#", async changes => {
  mock(); await expect(api({...query, params: {...params, ...changes}})).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
});
it("allows documented UTC cycles without assuming every model updates six-hourly", () => {
  expect(archiveRequest("single_run", {...params, run: "2026-09-23T01:00"}).url.searchParams.get("run")).toBe("2026-09-23T01:00");
});
it.each(["start_date", "end_date", "start_hour", "end_hour", "start_minutely_15", "end_minutely_15"])("rejects provider-forbidden Single Runs window %s before fetching", async key => {
  mock(); await expect(api({...query, params: {...params, [key]: "2026-09-23"}})).rejects.toThrow(`Single Runs rejects ${key}`);
  expect(fetch).not.toHaveBeenCalled();
});
it("does not label numeric native times with mismatched requested time units", async () => {
  mock({...fixture.response, hourly: {time: [1790121600], temperature_2m: [9]}});
  await expect(api({...query, params: {...params, timeformat: "unixtime"}})).rejects.toThrow("time units disagree");
});
it("does not invent universal earliest coverage or default forecast horizon", () => {
  const request = archiveRequest("single_run", {...params, run: "2024-03-14T00:00"});
  expect(request.url.searchParams.has("forecast_days")).toBe(false);
});
it("requires history dates and refuses a run selection on stitched data", () => {
  expect(() => archiveRequest("historical_forecast", params)).toThrow("stitched");
  expect(() => archiveRequest("historical_forecast", {latitude: 1, longitude: 1, hourly: "temperature_2m"})).toThrow("start_date");
});
it.each([
  {...fixture.response, hourly: {time: ["2026-09-23T00:00"], temperature_2m: []}},
  {...fixture.response, hourly_units: {}},
  {...fixture.response, hourly: {time: [], wrong_variable: []}, hourly_units: {wrong_variable: "°C"}},
  {...fixture.response, hourly: {time: ["invalid"], temperature_2m: [9]}},
  {...fixture.response, utc_offset_seconds: undefined},
  {error: true, reason: "unsupported model"},
  [fixture.response, fixture.response],
])("rejects broken data axes/units/locations %#", async data => {
  mock(data); await expect(api(query)).rejects.toThrow();
});
it("rejects a missing second model rather than attributing one series to both", () => {
  expect(() => validateArchiveData(fixture.response, {...params, models: "ecmwf_ifs,gfs_global", timeformat: "iso8601"}, 1)).toThrow("variable missing");
});
it("rejects writes", async () => { mock(); await expect(api({...query, method: "POST"})).rejects.toThrow("GET"); expect(fetch).not.toHaveBeenCalled(); });
it("bounds streaming reads and preserves status without embedding large error text", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("x".repeat(4 * 1024 * 1024 + 1))).mockResolvedValueOnce(new Response("x".repeat(200000), {status: 400})).mockResolvedValueOnce(new Response("bad json")));
  await expect(api(query)).rejects.toThrow("4 MiB");
  await expect(api(query)).rejects.toMatchObject({status: 400});
  await expect(api(query)).rejects.toThrow("JSON");
});
