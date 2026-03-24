import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class MeteoDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        const obj = data as Record<string, unknown>;

        // Hourly data (forecast or historical)
        if (obj.hourly && typeof obj.hourly === "object") {
            return {
                tableName: "hourly_data",
                indexes: ["time"],
            };
        }

        // Daily data
        if (obj.daily && typeof obj.daily === "object") {
            return {
                tableName: "daily_data",
                indexes: ["time"],
            };
        }

        // Geocoding search results
        if (obj.results && Array.isArray(obj.results)) {
            return {
                tableName: "locations",
                indexes: ["name", "country", "latitude", "longitude"],
            };
        }

        // Marine data
        if (obj.hourly_units && (obj as Record<string, unknown>).hourly) {
            return {
                tableName: "marine_data",
                indexes: ["time"],
            };
        }

        return undefined;
    }
}
