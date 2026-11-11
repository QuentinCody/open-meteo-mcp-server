import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { meteoUrl } from "./http";
import { readMeteoJson } from "./response";
import {archivedForecast, fail} from "./forecast-archive";

export function createMeteoApiFetch(): ApiFetchFn {
    return async (request) => {
        const params = { ...(request.params as Record<string, unknown> || {}) };

        if (request.method !== "GET" || request.body !== undefined) fail("Open-Meteo supports GET requests");
        if (request.path === "/v1/historical-forecast" || request.path === "/v1/single-run") {
            return {status: 200, data: await archivedForecast(request.path === "/v1/single-run" ? "single_run" : "historical_forecast", params)};
        }
        const result = await readMeteoJson(meteoUrl(request.path, params));
        return {status: result.status, data: result.data};
    };
}
