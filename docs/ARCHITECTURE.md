# Architecture

```text
NASA GIBS WMTS ───────────────┐
                             ├── Leaflet map / date selector
OpenStreetMap tiles ─────────┘

NASA POWER REST API
       │ daily point series (JSON)
       ▼
React data controller
       │ structured points
       ▼
Web Worker
       │ rolling median + MAD robust z-score
       ▼
Anomaly list + Recharts visualization
       │
       ├── JSON report export
       └── PWA Service Worker cache
```

## Trust boundaries

- NASA GIBS and NASA POWER are external, public endpoints; availability and latency are outside this application's control.
- The application does not request Earthdata login credentials.
- The anomaly detector is deterministic and locally executed.
- The fallback series is synthetic demonstration data and is explicitly labelled.
- Exported reports carry source and method metadata. Keep those fields when sharing results.
