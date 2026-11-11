# Open-Meteo MCP server

The server exposes weather, marine, air-quality, climate, flood, ensemble,
geocoding and elevation APIs through `meteo_search` and `meteo_execute`.
`meteo_query_data` and `meteo_get_schema` inspect staged results. All four tools
also have `mcp_meteo_` aliases. Complete tool responses stage above 30 KiB,
including SQL results, composed values and native provider errors.

## Forecast archives (local additions, 2026-09-28)

| Local operation | Provider endpoint | Meaning |
| --- | --- | --- |
| `/v1/historical-forecast` | `https://historical-forecast-api.open-meteo.com/v1/forecast` | Continuous series stitched from early hours of successive forecasts |
| `/v1/single-run` | `https://single-runs-api.open-meteo.com/v1/forecast` | Output selected by a model's UTC initialization datetime |
| Existing `/v1/archive` | `https://archive-api.open-meteo.com/v1/archive` | Historical reanalysis/analysis products; coverage depends on the model |

The [Historical Forecast documentation](https://open-meteo.com/en/docs/historical-forecast-api)
describes model-dependent coverage and changes over time. The
[Single Runs documentation](https://open-meteo.com/en/docs/single-runs-api)
identifies April 2, 2026 as the start for most models. ECMWF IFS HRES 9 km extends
back to March 14, 2024 and includes hindcasts. Run initialization is **not** the
time output became publicly available; distribution happens later. Consult the
provider's model-update information before any decision-time backtest.

```js
return await api.get("/v1/single-run", {
  latitude: 52.52, longitude: 13.41,
  models: "ecmwf_ifs", run: "2026-09-23T00:00",
  hourly: "temperature_2m", timezone: "GMT", forecast_days: 7
});
```

Historical Forecast requires `start_date` and `end_date`. Single Runs requires
an explicit `models` selection and `run` formatted `YYYY-MM-DDTHH:mm` in UTC,
without seconds or a timezone suffix. The provider validates model cycles and
archive availability; the adapter does not invent universal earliest dates.
Single Runs rejects explicit `start_date`/`end_date`, `start_hour`/`end_hour` and
`start_minutely_15`/`end_minutely_15`. Use `forecast_days`, `forecast_hours` or
`forecast_minutely_15` instead. Daily output requires initialization at midnight
in the requested timezone; a UTC midnight run can fail with a local timezone.
The complete native error body and HTTP status remain available for inspection.

Both routes accept hourly, daily and 15-minute variable groups, native units,
time formats, grid selection and elevation/radiation options. Requests are
bounded to 10 locations, 5 models, 30 total variables (20 per group), date windows
of at most 366 days, and 4 MiB/50 seconds per response. Split larger jobs into
explicit batches. These adapters use the public non-commercial API and do not
accept customer API keys or alternate hosts.

Results retain the complete native payload in `data` and source/request/hash
metadata in `provenance`. Coordinates returned by the provider identify model
grid cells and may differ from requested coordinates. Parallel time/value arrays,
model suffixes, timezone/offset, units, missing values and additional fields are
preserved. No automatic timezone conversion or lead-time calculation occurs.
The requested run timestamp is labeled as request-derived: public availability,
model version, echoed run identity and full forecast-horizon coverage are not
asserted. Stitched history receives no inferred initialization timestamp.

Staged scalar archive wrappers retain complete parallel arrays in `payloads`;
the payload row count is not an hourly observation count. Use `meteo_get_schema`
and bounded SQL reads of `payloads.root_json` (following `content_chunks` when
necessary) to recover the full response. No hourly-row projection is promised.
Citations verify recovered data or, for complete-response staging, the complete
original tool result. The raw response hash covers the decoded UTF-8 bytes,
including any BOM; per-request `generationtime_ms` can change that hash even
when weather values are identical.

## Verification

Two provider-linked examples were readable through web retrieval: a 168-hour
Single Runs result and a 360-hour Historical Forecast result. Captured JSON is
stored in the respective `src/lib/*.fixture.json` files with source URLs and
capture notes; response headers were not captured. Other validation scenarios
use synthetic fixtures.

On October 3, 2026, **92 live local Worker/MCP acceptance calls** pass against
native provider responses: both archive APIs and recipes, two UTC cycles, two
models/locations, Unix timestamps, alternate units, hourly/daily/15-minute data,
a staged month of forecasts, unavailable model/run errors and all nine existing
routes. Independent native comparisons exclude only `generationtime_ms`; all
other source fields match. A staged 720-hour archive and large composed/SQL
responses recover completely with verified citations through both aliases.

**62 focused behavioral tests** and **7 scaffold checks** pass. The seeded live
contract harness passes eight checks; readiness is not implemented and its small
probe does not stage. Dedicated acceptance above verifies staging separately.
Repository validation and evidence are recorded in the
[implementation tracker](../../../docs/plans/2026-09-26-upstream-api-implementation.md).
These additions have not been deployed.
```sh
./scripts/dev-servers.sh open-meteo
pnpm exec vitest run servers/finance/open-meteo-mcp-server
node scripts/verify-server.mjs open-meteo --local
```

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from Open-Meteo and stays under the terms of that source: Free API is non-commercial; commercial needs a subscription.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
