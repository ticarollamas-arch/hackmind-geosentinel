# HACKMIND GeoSentinel

**Earth Intelligence · Open Earth Observation · NASA data in the browser**

GeoSentinel is an open-source prototype for exploring NASA Earth-observation imagery and analyzing environmental time series. The MVP combines NASA GIBS imagery with NASA POWER daily point data and a deterministic anomaly detector that runs in a Web Worker.

> Important: this is a decision-support prototype, not an operational early-warning service. An anomaly is a statistical deviation, not proof of an environmental event. Validate results with domain experts and independent observations.

## What works

- **NASA GIBS map layer:** MODIS Terra or VIIRS SNPP true-colour imagery, selectable by date.
- **NASA POWER time series:** requests the last 90 days of daily solar radiation, 2 m temperature, or corrected precipitation for the selected map coordinate.
- **Local anomaly engine:** rolling median and median absolute deviation (MAD), robust z-score threshold `|z| >= 3.5`, executed in a browser Web Worker.
- **Live test event:** injects a synthetic spike to demonstrate detection. It is labelled as synthetic and is never represented as a real observation.
- **Offline resilience:** PWA app shell and successful NASA responses are cached by a service worker. Previously loaded data can be revisited; fresh NASA data and uncached map tiles require connectivity.
- **Export:** downloads a JSON report with location, provenance, method, threshold, summary, and analyzed points.
- **No API key, login, or backend required.**

## Stack

- React 18 + Vite
- Leaflet + OpenStreetMap
- NASA GIBS WMTS imagery
- NASA POWER REST API
- Web Worker + deterministic JavaScript algorithm
- Service Worker / PWA cache
- Recharts

## Requirements

- Node.js 20.19+ or 22.12+
- npm 10+
- Modern browser with ES modules, Web Workers, Fetch, and Service Worker support

## Run locally

```bash
unzip HACKMIND-GeoSentinel.zip
cd HACKMIND-GeoSentinel
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). For service-worker and offline tests, use localhost or HTTPS.

## Production build

```bash
npm run test
npm run build
npm run preview
```

The static site is generated in `dist/`.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. Import the repository in Vercel.
3. Framework preset: **Vite**.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. No environment variables are required.

A `vercel.json` is included for SPA fallback and static asset caching.

## Deploy to any static host

Upload the contents of `dist/` to a static web host. Configure all unknown application routes to serve `/index.html`. HTTPS is required for service workers outside localhost.

## Data sources and attribution

### NASA POWER

- API: <https://power.larc.nasa.gov/api/temporal/daily/point>
- Project: <https://power.larc.nasa.gov/>
- Used for daily meteorological and solar parameters at a latitude/longitude point.
- This application uses `ALLSKY_SFC_SW_DWN`, `T2M`, and `PRECTOTCORR`.
- NASA POWER values may be modelled/reanalysis-derived products and are not necessarily direct local sensor readings. Consult the API documentation and product metadata before scientific use.

### NASA GIBS

- Documentation: <https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs>
- WMTS imagery is displayed as a visual context layer. It is not used as the numeric input to the anomaly algorithm in this MVP.
- Available imagery dates depend on layer latency and product availability.

### OpenStreetMap

- Map tiles: <https://www.openstreetmap.org/>
- Copyright and attribution: <https://www.openstreetmap.org/copyright>
- OSM tile usage policy: <https://operations.osmfoundation.org/policies/tiles/>

## Algorithm

For each daily value, the detector selects a local temporal window, computes its median `m`, then computes the median absolute deviation:

`MAD = median(|xᵢ - m|)`

The robust score is:

`zᵣ = (x - m) / (1.4826 × MAD)`

A point is flagged when `|zᵣ| >= 3.5`. The multiplier 1.4826 makes MAD comparable to standard deviation for normally distributed data. A zero MAD yields a score of zero rather than division by zero.

This is a transparent baseline method. It is not seasonally adjusted, does not account for all missing-data patterns, and should not be interpreted as a validated environmental alert model.

## Reliability and limitations

- Circuit-breaker-like fallback: if NASA POWER is unavailable, the UI uses a deterministic **local demonstration fixture**. The source status and warning identify it; do not cite fixture values as NASA observations.
- GIBS imagery can be delayed or unavailable for the most recent date. Select an earlier date if tiles are blank.
- NASA POWER may return fill values; the app filters values at or below `-900`.
- The map defaults to Nova Lima, Minas Gerais, Brazil; click any point to query that coordinate.
- The current MVP queries one coordinate and one variable at a time.
- Offline mode caches the app shell and successful NASA GET responses. It cannot guarantee a first-time offline experience or complete offline map coverage.
- Browser execution time depends on device and series size. The displayed worker time measures the local detector only, not network download or map rendering.
- No `35 ms`, `100% accuracy`, cost-saving, or other performance claims are hard-coded as proven results.

## Competition demo script (2 minutes)

1. **0:00–0:20** — Explain the use case: quickly inspect an environmental variable at a location using public Earth data.
2. **0:20–0:45** — Show the NASA GIBS layer and change the imagery date.
3. **0:45–1:10** — Select solar radiation, temperature, or precipitation; run the NASA POWER query.
4. **1:10–1:35** — Explain the rolling median/MAD detector and show its worker execution time.
5. **1:35–1:50** — Click “Injetar anomalia de teste”; point out that the event is synthetic, then show the event log.
6. **1:50–2:00** — Export JSON and show source links, MIT license, and repository.

For a robust live demo, test the exact location/date/variable and have a cached session ready. Never describe a synthetic injected event as a real NASA-detected event.

## Tests

```bash
npm test
```

Unit tests cover median calculation, robust anomaly detection, and empty input handling.

## License

MIT. See [LICENSE](./LICENSE). Third-party services and libraries retain their own terms and attribution requirements.
