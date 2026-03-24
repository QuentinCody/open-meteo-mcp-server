import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const meteoCatalog: ApiCatalog = {
    name: "Open-Meteo",
    baseUrl: "https://api.open-meteo.com",
    version: "1.0",
    auth: "none",
    endpointCount: 10,
    notes:
        "- No API key required (free for non-commercial use)\n" +
        "- All endpoints require latitude and longitude\n" +
        "- Use /v1/search for geocoding (name → lat/lon) first if needed\n" +
        "- Hourly variables: temperature_2m, relative_humidity_2m, dew_point_2m,\n" +
        "  apparent_temperature, precipitation, rain, snowfall, snow_depth,\n" +
        "  weather_code, pressure_msl, surface_pressure, cloud_cover,\n" +
        "  wind_speed_10m, wind_direction_10m, wind_gusts_10m, uv_index,\n" +
        "  soil_temperature_0cm, soil_moisture_0_to_1cm, sunshine_duration, is_day\n" +
        "- Daily variables: temperature_2m_max, temperature_2m_min, precipitation_sum,\n" +
        "  rain_sum, snowfall_sum, precipitation_hours, wind_speed_10m_max,\n" +
        "  wind_gusts_10m_max, wind_direction_10m_dominant, sunrise, sunset,\n" +
        "  sunshine_duration, uv_index_max\n" +
        "- Pass variable names as comma-separated strings: hourly=temperature_2m,precipitation\n" +
        "- timezone=auto auto-detects from coordinates\n" +
        "- Different subdomains for different endpoints (auto-routed by adapter)\n" +
        "- Historical data available from 1940 to present via /v1/archive",
    endpoints: [
        {
            method: "GET",
            path: "/v1/forecast",
            summary: "16-day hourly/daily weather forecast for any location",
            category: "forecast",
            queryParams: [
                { name: "latitude", type: "number", required: true, description: "Latitude (e.g. 52.52 for Berlin)" },
                { name: "longitude", type: "number", required: true, description: "Longitude (e.g. 13.41 for Berlin)" },
                { name: "hourly", type: "string", required: false, description: "Comma-separated hourly variables (e.g. temperature_2m,precipitation)" },
                { name: "daily", type: "string", required: false, description: "Comma-separated daily variables (e.g. temperature_2m_max,precipitation_sum)" },
                { name: "timezone", type: "string", required: false, description: "Timezone (e.g. auto, America/New_York, UTC)", default: "auto" },
                { name: "forecast_days", type: "number", required: false, description: "Number of forecast days (1-16)", default: 7 },
                { name: "temperature_unit", type: "string", required: false, description: "celsius or fahrenheit", default: "celsius" },
                { name: "wind_speed_unit", type: "string", required: false, description: "kmh, ms, mph, kn", default: "kmh" },
                { name: "precipitation_unit", type: "string", required: false, description: "mm or inch", default: "mm" },
            ],
        },
        {
            method: "GET",
            path: "/v1/archive",
            summary: "Historical weather data from 1940 to present. Same variables as forecast",
            category: "historical",
            queryParams: [
                { name: "latitude", type: "number", required: true, description: "Latitude" },
                { name: "longitude", type: "number", required: true, description: "Longitude" },
                { name: "start_date", type: "string", required: true, description: "Start date YYYY-MM-DD" },
                { name: "end_date", type: "string", required: true, description: "End date YYYY-MM-DD" },
                { name: "hourly", type: "string", required: false, description: "Comma-separated hourly variables" },
                { name: "daily", type: "string", required: false, description: "Comma-separated daily variables" },
                { name: "timezone", type: "string", required: false, description: "Timezone", default: "auto" },
                { name: "temperature_unit", type: "string", required: false, description: "celsius or fahrenheit" },
            ],
        },
        {
            method: "GET",
            path: "/v1/marine",
            summary: "Marine weather: wave height, period, direction, ocean temperature",
            category: "marine",
            queryParams: [
                { name: "latitude", type: "number", required: true, description: "Latitude" },
                { name: "longitude", type: "number", required: true, description: "Longitude" },
                { name: "hourly", type: "string", required: false, description: "Variables: wave_height, wave_direction, wave_period, ocean_current_velocity" },
                { name: "daily", type: "string", required: false, description: "Daily marine variables" },
                { name: "timezone", type: "string", required: false, description: "Timezone", default: "auto" },
            ],
        },
        {
            method: "GET",
            path: "/v1/air-quality",
            summary: "Air quality: PM2.5, PM10, O3, NO2, SO2, CO, aerosol, UV index",
            category: "air_quality",
            queryParams: [
                { name: "latitude", type: "number", required: true, description: "Latitude" },
                { name: "longitude", type: "number", required: true, description: "Longitude" },
                { name: "hourly", type: "string", required: false, description: "Variables: pm2_5, pm10, ozone, nitrogen_dioxide, sulphur_dioxide, carbon_monoxide, uv_index, european_aqi, us_aqi" },
                { name: "timezone", type: "string", required: false, description: "Timezone", default: "auto" },
            ],
        },
        {
            method: "GET",
            path: "/v1/climate",
            summary: "Climate projections (CMIP6 models) to 2050. Monthly/daily resolution",
            category: "climate",
            queryParams: [
                { name: "latitude", type: "number", required: true, description: "Latitude" },
                { name: "longitude", type: "number", required: true, description: "Longitude" },
                { name: "start_date", type: "string", required: true, description: "Start date YYYY-MM-DD" },
                { name: "end_date", type: "string", required: true, description: "End date YYYY-MM-DD" },
                { name: "daily", type: "string", required: false, description: "Daily variables" },
                { name: "models", type: "string", required: false, description: "Climate model(s): CMCC_CM2_VHR4, FGOALS_f3_H, HiRAM_SIT_HR, MRI_AGCM3_2_S, EC_Earth3P_HR, MPI_ESM1_2_XR, NICAM16_8S" },
            ],
        },
        {
            method: "GET",
            path: "/v1/flood",
            summary: "River discharge forecasts (GloFAS data)",
            category: "flood",
            queryParams: [
                { name: "latitude", type: "number", required: true, description: "Latitude" },
                { name: "longitude", type: "number", required: true, description: "Longitude" },
                { name: "daily", type: "string", required: false, description: "Variables: river_discharge, river_discharge_mean, river_discharge_max, river_discharge_min" },
                { name: "forecast_days", type: "number", required: false, description: "Forecast days (max 210)" },
            ],
        },
        {
            method: "GET",
            path: "/v1/elevation",
            summary: "Terrain elevation for coordinates (returns elevation in meters)",
            category: "geocoding",
            queryParams: [
                { name: "latitude", type: "number", required: true, description: "Latitude" },
                { name: "longitude", type: "number", required: true, description: "Longitude" },
            ],
        },
        {
            method: "GET",
            path: "/v1/search",
            summary: "Geocoding: location name → latitude/longitude. Use this to find coordinates",
            category: "geocoding",
            queryParams: [
                { name: "name", type: "string", required: true, description: "Location name to search (e.g. 'Berlin', 'New York')" },
                { name: "count", type: "number", required: false, description: "Max results", default: 10 },
                { name: "language", type: "string", required: false, description: "Language for results (e.g. en, de, fr)" },
                { name: "format", type: "string", required: false, description: "Response format: json", default: "json" },
            ],
        },
        {
            method: "GET",
            path: "/v1/ensemble",
            summary: "Multi-model ensemble forecasts for uncertainty estimation",
            category: "ensemble",
            queryParams: [
                { name: "latitude", type: "number", required: true, description: "Latitude" },
                { name: "longitude", type: "number", required: true, description: "Longitude" },
                { name: "hourly", type: "string", required: false, description: "Hourly variables" },
                { name: "models", type: "string", required: false, description: "Ensemble models: icon_seamless, icon_global, gfs_seamless, ecmwf_ifs04, gem_global, bom_access_global" },
                { name: "timezone", type: "string", required: false, description: "Timezone", default: "auto" },
            ],
        },
    ],
};
