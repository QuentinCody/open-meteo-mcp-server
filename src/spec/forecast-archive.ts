import type {ApiCatalog, WorkflowRecipe} from "@bio-mcp/shared/codemode/catalog";
const common = [
  {name: "latitude", type: "string" as const, required: true, description: "WGS84 latitude, number or comma-separated list (1–10 locations)"},
  {name: "longitude", type: "string" as const, required: true, description: "WGS84 longitude, number or comma-separated list matching latitude count"},
  {name: "models", type: "string" as const, required: false, description: "1–5 explicit model codes, e.g. ecmwf_ifs, gfs_global; required for Single Runs. Requested model is not a pinned model version."},
  {name: "hourly", type: "string" as const, required: false, description: "Hourly variables, e.g. temperature_2m,precipitation; select 1–30 total variables across time groups, at most 20 per group"},
  {name: "daily", type: "string" as const, required: false, description: "Daily variables, e.g. temperature_2m_max,precipitation_sum; units and time aggregation preserved"},
  {name: "minutely_15", type: "string" as const, required: false, description: "15-minute variables; availability/resolution is model- and region-dependent"},
  {name: "timezone", type: "string" as const, required: false, description: "Default GMT; auto or IANA zone supported, including comma-separated zones for locations. Run initialization remains UTC."},
  {name: "timeformat", type: "string" as const, required: false, enum: ["iso8601", "unixtime"], description: "Default iso8601; raw time axes and UTC offset retained without conversion"},
  {name: "temperature_unit", type: "string" as const, required: false, enum: ["celsius", "fahrenheit"], description: "Provider temperature units"},
  {name: "wind_speed_unit", type: "string" as const, required: false, enum: ["kmh", "ms", "mph", "kn"], description: "Provider wind units"},
  {name: "precipitation_unit", type: "string" as const, required: false, enum: ["mm", "inch"], description: "Provider precipitation units"},
  {name: "elevation", type: "string" as const, required: false, description: "Elevation override; nan disables statistical downscaling. Returned coordinates are model grid-cell coordinates."},
  {name: "cell_selection", type: "string" as const, required: false, enum: ["land", "sea", "nearest"], description: "Grid-cell selection"},
  {name: "tilt", type: "number" as const, required: false, description: "Panel tilt for tilted radiation"},
  {name: "azimuth", type: "number" as const, required: false, description: "Panel azimuth for tilted radiation"},
];
export const archiveEndpoints: ApiCatalog["endpoints"] = [
  {method: "GET", path: "/v1/historical-forecast", category: "forecast_history", summary: "Local alias to historical-forecast-api.open-meteo.com/v1/forecast. Stitched early forecast hours, not reanalysis or one issued forecast. Returns full native data and provenance; date windows at most 366 days; 4 MiB response cap.",
    queryParams: [...common, {name: "start_date", type: "string", required: true, description: "Inclusive YYYY-MM-DD; model-specific archive coverage"}, {name: "end_date", type: "string", required: true, description: "Inclusive YYYY-MM-DD; split longer windows explicitly"}]},
  {method: "GET", path: "/v1/single-run", category: "forecast_history", summary: "Local alias to single-runs-api.open-meteo.com/v1/forecast. Explicit model/run archive, not reanalysis. run is UTC initialization, NOT public availability; model output often arrives hours later. Returns native forecast data and request/source context.",
    queryParams: [...common.map(p => p.name === "models" ? {...p, required: true} : p.name === "daily" ? {...p, description: `${p.description}; Single Runs requires initialization at midnight in the requested timezone`} : p),
      {name: "run", type: "string", required: true, description: "YYYY-MM-DDTHH:mm in UTC, no seconds or Z. Valid model cycle required; unavailable runs return errors. Most models archived from 2026-04-02; ECMWF IFS HRES 9km from 2024-03-14 includes hindcasts."},
      {name: "forecast_days", type: "number", required: false, description: "Requested horizon, 0–16; provider default 7. Availability varies; longer windows may contain nulls."},
      {name: "forecast_hours", type: "number", required: false, description: "Optional hourly range, at most 384; explicit start/end date, hour and 15-minute windows are not accepted by Single Runs"},
      {name: "forecast_minutely_15", type: "number", required: false, description: "Optional count of 15-minute steps, at most 1536; model and region determine availability"}]},
];
export const archiveWorkflows: WorkflowRecipe[] = [
  {title: "Retrieve an individual initialized forecast run", keywords: ["single run", "forecast", "initialization", "backtest", "issue time"],
    description: "Select a known model and UTC cycle. Keep native valid times/units with the requested initialization time. This request does not verify publication time or availability at a trading/decision cutoff; ECMWF older archives include hindcasts. Missing values remain null.",
    code: `return await api.get("/v1/single-run", {latitude: 52.52, longitude: 13.41, models: "ecmwf_ifs", run: "2026-09-23T00:00", hourly: "temperature_2m", timezone: "GMT", forecast_days: 7});`},
  {title: "Retrieve stitched historical forecast data with explicit model selection", keywords: ["historical forecast", "stitched", "archive", "reanalysis"],
    description: "Historical Forecast uses early hours from successive runs. Select an explicit model and date window; preserve returned grid coordinates, units and missing values. This is not a homogeneous long-term climate series or a fixed issue-time backtest.",
    code: `return await api.get("/v1/historical-forecast", {latitude: 52.52, longitude: 13.41, models: "ecmwf_ifs", start_date: "2026-09-08", end_date: "2026-09-22", hourly: "temperature_2m", timezone: "GMT"});`},
];
