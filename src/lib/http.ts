import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const METEO_BASE = "https://api.open-meteo.com";
const GEOCODING_BASE = "https://geocoding-api.open-meteo.com";
const ARCHIVE_BASE = "https://archive-api.open-meteo.com";
const AIR_QUALITY_BASE = "https://air-quality-api.open-meteo.com";
const FLOOD_BASE = "https://flood-api.open-meteo.com";
const CLIMATE_BASE = "https://climate-api.open-meteo.com";
const MARINE_BASE = "https://marine-api.open-meteo.com";
const ENSEMBLE_BASE = "https://ensemble-api.open-meteo.com";

/**
 * Route to the correct Open-Meteo subdomain based on path.
 */
function getBaseUrl(path: string): string {
    if (path.startsWith("/v1/search")) return GEOCODING_BASE;
    if (path.startsWith("/v1/archive")) return ARCHIVE_BASE;
    if (path.startsWith("/v1/air-quality")) return AIR_QUALITY_BASE;
    if (path.startsWith("/v1/flood")) return FLOOD_BASE;
    if (path.startsWith("/v1/climate")) return CLIMATE_BASE;
    if (path.startsWith("/v1/marine")) return MARINE_BASE;
    if (path.startsWith("/v1/ensemble")) return ENSEMBLE_BASE;
    return METEO_BASE;
}

export interface MeteoFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
}

/**
 * Fetch from the Open-Meteo API.
 * Routes to the correct subdomain based on the path.
 */
export async function meteoFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: MeteoFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? getBaseUrl(path);

    return restFetch(baseUrl, path, params, {
        ...opts,
        headers: {
            Accept: "application/json",
            ...(opts?.headers ?? {}),
        },
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 2,
        timeout: opts?.timeout ?? 30_000,
        userAgent: "open-meteo-mcp-server/1.0 (bio-mcp)",
    });
}
