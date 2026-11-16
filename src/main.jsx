import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronDown,
  Cloud, Cpu, Database, Download, ExternalLink, Globe2, Layers3, LocateFixed,
  Menu, Moon, Radio, RefreshCw, Satellite, ShieldCheck, Signal, Wifi, WifiOff,
  Zap
} from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { summarizeAnomalies } from "./anomaly.js";
import "./style.css";

const NASA_POWER = "https://power.larc.nasa.gov/api/temporal/daily/point";
const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
const LAYERS = [
  { id: "MODIS_Terra_CorrectedReflectance_TrueColor", label: "MODIS Terra · Cor verdadeira", ext: "jpg" },
  { id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", label: "VIIRS SNPP · Cor verdadeira", ext: "jpg" }
];
const VARIABLES = [
  { id: "ALLSKY_SFC_SW_DWN", label: "Radiação solar", unit: "kWh/m²/dia", color: "#45e4b5" },
  { id: "T2M", label: "Temperatura a 2 m", unit: "°C", color: "#f5b84b" },
  { id: "PRECTOTCORR", label: "Precipitação", unit: "mm/dia", color: "#65a9ff" }
];

function dateKey(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}
function isoFromKey(key) {
  return `${key.slice(0,4)}-${key.slice(4,6)}-${key.slice(6,8)}`;
}
function sampleSeries(variable) {
  // Explicitly labelled deterministic fixture: shown only if the NASA endpoint is unavailable.
  const end = new Date();
  const points = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const seasonal = Math.sin((89 - i) / 13) * (variable === "T2M" ? 2.2 : 0.8);
    let value = variable === "T2M" ? 25 + seasonal : variable === "PRECTOTCORR" ? 2.5 + Math.max(0, Math.sin(i * 1.7)) * 5 : 5.2 + seasonal;
    if (i === 14 || i === 53) value += variable === "PRECTOTCORR" ? 16 : variable === "T2M" ? 8 : 3.4;
    points.push({ date: d.toISOString().slice(0,10), value: Number(value.toFixed(2)) });
  }
  return points;
}
function formatDate(value) {
  return new Date(value + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function App() {
  const [coords, setCoords] = useState({ lat: -19.982, lon: -43.846, label: "Nova Lima, MG" });
  const [variable, setVariable] = useState(VARIABLES[0]);
  const [layer, setLayer] = useState(LAYERS[0]);
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [series, setSeries] = useState([]);
  const [source, setSource] = useState("loading");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [injected, setInjected] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const tileRef = useRef(null);
  const workerRef = useRef(null);
  const requestRef = useRef(0);
  const [processed, setProcessed] = useState([]);
  const [engineMs, setEngineMs] = useState(null);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, { zoomControl: false, preferCanvas: true }).setView([coords.lat, coords.lon], 7);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);
    mapInstance.current = map;
    markerRef.current = L.circleMarker([coords.lat, coords.lon], {
      radius: 8, color: "#07111f", weight: 3, fillColor: "#45e4b5", fillOpacity: 1
    }).addTo(map);
    map.on("click", (event) => {
      setCoords({ lat: Number(event.latlng.lat.toFixed(4)), lon: Number(event.latlng.lng.toFixed(4)), label: "Ponto selecionado" });
    });
    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;
    markerRef.current?.setLatLng([coords.lat, coords.lon]);
    mapInstance.current.panTo([coords.lat, coords.lon], { animate: true, duration: 0.5 });
  }, [coords]);

  useEffect(() => {
    if (!mapInstance.current) return;
    if (tileRef.current) mapInstance.current.removeLayer(tileRef.current);
    const url = `${GIBS_BASE}/${layer.id}/default/${date}/${"GoogleMapsCompatible_Level9"}/{z}/{y}/{x}.${layer.ext}`;
    tileRef.current = L.tileLayer(url, { opacity: 0.78, maxZoom: 9, attribution: "NASA GIBS" });
    tileRef.current.addTo(mapInstance.current);
  }, [layer, date]);

  const runWorker = useCallback((points) => {
    const started = performance.now();
    if (workerRef.current) workerRef.current.terminate();
    const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    workerRef.current = worker;
    const id = ++requestRef.current;
    worker.onmessage = (event) => {
      if (event.data.id !== id) return;
      if (event.data.ok) {
        setProcessed(event.data.result);
        setEngineMs(Math.round(performance.now() - started));
      }
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    worker.postMessage({ id, points, options: { windowSize: 21, threshold: 3.5 } });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    setInjected(false);
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 89);
    const params = new URLSearchParams({
      parameters: variable.id,
      community: "RE",
      longitude: String(coords.lon),
      latitude: String(coords.lat),
      start: dateKey(start),
      end: dateKey(end),
      format: "JSON"
    });
    try {
      if (!navigator.onLine) throw new Error("Dispositivo offline");
      const response = await fetch(`${NASA_POWER}?${params}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`NASA POWER respondeu HTTP ${response.status}`);
      const json = await response.json();
      const raw = json?.properties?.parameter?.[variable.id];
      if (!raw || !Object.keys(raw).length) throw new Error("A API não retornou valores para este ponto.");
      const points = Object.entries(raw)
        .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > -900)
        .map(([key, value]) => ({ date: isoFromKey(key), value: Number(value) }));
      if (points.length < 10) throw new Error("Série temporal insuficiente para análise.");
      setSeries(points);
      setSource("NASA POWER");
      setLastUpdated(new Date());
      runWorker(points);
    } catch (err) {
      const fixture = sampleSeries(variable.id);
      setSeries(fixture);
      setSource("fixture");
      setLastUpdated(new Date());
      setError(`${err.message}. Exibindo série demonstrativa local; não é dado observado da NASA.`);
      runWorker(fixture);
    } finally {
      setLoading(false);
    }
  }, [coords, variable, runWorker]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => () => workerRef.current?.terminate(), []);

  const summary = useMemo(() => summarizeAnomalies(processed), [processed]);
  const chartData = useMemo(() => processed.map((p) => ({
    ...p, shortDate: formatDate(p.date), value: p.value, baseline: p.baseline
  })), [processed]);

  const injectAnomaly = () => {
    if (!series.length) return;
    const next = series.map((p) => ({ ...p }));
    const index = Math.max(3, Math.min(next.length - 3, next.length - 8));
    const multiplier = variable.id === "PRECTOTCORR" ? 5.5 : 1.65;
    next[index] = { ...next[index], value: Number((next[index].value * multiplier + (variable.id === "T2M" ? 12 : 8)).toFixed(2)) };
    setSeries(next);
    setInjected(true);
    runWorker(next);
  };

  const downloadReport = () => {
    const payload = {
      product: "HACKMIND GeoSentinel",
      generatedAt: new Date().toISOString(),
      source,
      variable: { id: variable.id, label: variable.label, unit: variable.unit },
      location: coords,
      summary,
      engine: "Rolling median + MAD robust z-score",
      threshold: 3.5,
      data: processed
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "geosentinel-relatorio.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const changeDate = (value) => setDate(value);
  const risk = summary.anomalies > 4 ? "high" : summary.anomalies > 0 ? "medium" : "low";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Globe2 size={22}/></div>
          <div><strong>HACKMIND</strong><span>EARTH INTELLIGENCE</span></div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <button className="nav-item active"><Layers3 size={17}/> GeoSentinel <span className="nav-live">LIVE</span></button>
        <button className="nav-item" onClick={() => document.getElementById("analysis")?.scrollIntoView({ behavior: "smooth" })}><Activity size={17}/> Anomaly Engine</button>
        <button className="nav-item" onClick={() => document.getElementById("data-source")?.scrollIntoView({ behavior: "smooth" })}><Database size={17}/> Data sources</button>
        <div className="sidebar-bottom">
          <div className="side-status"><span className={`status-dot ${online ? "green" : "red"}`}></span><span>{online ? "Network connected" : "Offline mode"}</span></div>
          <div className="side-version">GEOSENTINEL / v1.0.0</div>
          <div className="side-license">OPEN SOURCE · MIT</div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menu"><Menu size={19}/></button>
          <div className="breadcrumb">Earth Intelligence <span>/</span> <b>GeoSentinel</b></div>
          <div className="top-actions">
            <div className={`connection ${online ? "connected" : "disconnected"}`}>{online ? <Wifi size={14}/> : <WifiOff size={14}/>} {online ? "ONLINE" : "OFFLINE"}</div>
            <div className="avatar">HM</div>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <div className="eyebrow"><span className="pulse"></span> EARTH OBSERVATION SYSTEM</div>
            <h1>Geo<span>Sentinel</span></h1>
            <p>Monitoramento ambiental e detecção de anomalias com dados abertos.</p>
          </div>
          <div className="heading-actions">
            <button className="button secondary" onClick={downloadReport} disabled={!processed.length}><Download size={16}/> Exportar relatório</button>
            <button className="button primary" onClick={loadData} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""}/> {loading ? "Atualizando" : "Atualizar dados"}</button>
          </div>
        </section>

        <section className="metrics-grid">
          <Metric icon={<Satellite size={18}/>} label="FONTE DE DADOS" value={source === "NASA POWER" ? "NASA POWER" : source === "fixture" ? "LOCAL FIXTURE" : "CONECTANDO"} detail={source === "NASA POWER" ? "Dados científicos ao vivo" : source === "fixture" ? "Demonstração identificada" : "Consultando endpoint"} tone="mint"/>
          <Metric icon={<AlertTriangle size={18}/>} label="ANOMALIAS DETECTADAS" value={String(summary.anomalies).padStart(2,"0")} detail={`${summary.percentage}% da série analisada`} tone={risk === "high" ? "red" : risk === "medium" ? "amber" : "mint"}/>
          <Metric icon={<Cpu size={18}/>} label="PROCESSAMENTO LOCAL" value={engineMs === null ? "—" : `${engineMs} ms`} detail="Web Worker · mediana + MAD" tone="blue"/>
          <Metric icon={<ShieldCheck size={18}/>} label="PRIVACIDADE" value="LOCAL" detail="Sem conta · sem chave de API" tone="mint"/>
        </section>

        {error && <div className="notice warning"><AlertTriangle size={17}/><div><b>Modo de contingência</b><span>{error}</span></div></div>}
        {injected && <div className="notice success"><CheckCircle2 size={17}/><div><b>Anomalia sintética injetada</b><span>Evento de teste adicionado à série em memória. Não representa ocorrência ambiental real.</span></div></div>}

        <section className="content-grid">
          <div className="panel map-panel">
            <div className="panel-header">
              <div><div className="panel-kicker">GEOSPATIAL VIEW</div><h2>Mapa de observação</h2></div>
              <div className="map-tools"><span className="map-tag"><span className="status-dot green"></span> NASA GIBS</span></div>
            </div>
            <div className="map-wrap"><div ref={mapRef} className="map" />
              <div className="map-overlay"><span>LAT {coords.lat.toFixed(4)}°</span><span>LON {coords.lon.toFixed(4)}°</span></div>
              <div className="map-hint"><LocateFixed size={13}/> Clique no mapa para analisar outro ponto</div>
            </div>
            <div className="map-footer"><div><span className="legend-dot nasa"></span> Imagem de satélite NASA GIBS</div><span>Camada: {layer.label}</span></div>
          </div>

          <div className="panel control-panel">
            <div className="panel-header"><div><div className="panel-kicker">ANALYSIS CONFIG</div><h2>Parâmetros</h2></div><SlidersIcon/></div>
            <label className="field-label">VARIÁVEL AMBIENTAL</label>
            <div className="select-wrap"><select value={variable.id} onChange={(e) => setVariable(VARIABLES.find(v => v.id === e.target.value))}>{VARIABLES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select><ChevronDown size={15}/></div>
            <label className="field-label">CAMADA DE SATÉLITE</label>
            <div className="select-wrap"><select value={layer.id} onChange={(e) => setLayer(LAYERS.find(v => v.id === e.target.value))}>{LAYERS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select><ChevronDown size={15}/></div>
            <label className="field-label">DATA DA IMAGEM NASA GIBS</label>
            <input className="date-input" type="date" value={date} max={new Date().toISOString().slice(0,10)} onChange={(e) => changeDate(e.target.value)}/>
            <div className="location-box"><LocateFixed size={16}/><div><b>{coords.label}</b><span>{coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}</span></div><button title="Voltar para Nova Lima" onClick={() => setCoords({lat:-19.982,lon:-43.846,label:"Nova Lima, MG"})}>Reset</button></div>
            <button className="button primary full" onClick={loadData} disabled={loading}><Zap size={16}/> Executar análise</button>
            <div className="control-foot"><ShieldCheck size={14}/> Cálculo executado no dispositivo</div>
          </div>
        </section>

        <section className="panel analysis-panel" id="analysis">
          <div className="panel-header analysis-heading">
            <div><div className="panel-kicker">LOCAL ANOMALY ENGINE</div><h2>Série temporal & anomalias</h2><p>NASA POWER · {variable.label} · últimos 90 dias</p></div>
            <div className={`risk-pill ${risk}`}><span></span>{risk === "high" ? "ATENÇÃO" : risk === "medium" ? "ANOMALIA" : "ESTÁVEL"}</div>
          </div>
          <div className="chart-wrap">
            {chartData.length ? <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{top:12,right:14,left:0,bottom:0}}>
                <CartesianGrid stroke="#203146" strokeDasharray="3 5" vertical={false}/>
                <XAxis dataKey="shortDate" tick={{fill:"#8496aa",fontSize:11}} axisLine={false} tickLine={false} minTickGap={30}/>
                <YAxis tick={{fill:"#8496aa",fontSize:11}} axisLine={false} tickLine={false} width={48}/>
                <Tooltip contentStyle={{background:"#101e30",border:"1px solid #2b4058",borderRadius:10,color:"#eaf2f8"}} labelStyle={{color:"#aab9c8"}} formatter={(v,n) => [`${v} ${variable.unit}`, n === "baseline" ? "Referência local" : variable.label]}/>
                <Line type="monotone" dataKey="baseline" stroke="#71849a" strokeDasharray="5 5" dot={false} strokeWidth={1.5} name="baseline"/>
                <Line type="monotone" dataKey="value" stroke={variable.color} strokeWidth={2.2} dot={(props) => props.payload.anomaly ? <circle cx={props.cx} cy={props.cy} r={5} fill="#ff626e" stroke="#fff" strokeWidth={1.5}/> : null} activeDot={{r:5}} name="value"/>
              </LineChart>
            </ResponsiveContainer> : <div className="chart-empty">{loading ? "Carregando série temporal..." : "Sem dados para exibir."}</div>}
          </div>
          <div className="chart-legend"><span><i className="legend-line"></i> Valor observado</span><span><i className="legend-line dashed"></i> Linha de base móvel</span><span><i className="legend-dot alert"></i> Anomalia estatística</span><span className="threshold">Limiar robusto: |z| ≥ 3,5</span></div>
          <div className="analysis-actions">
            <div className="analysis-explain"><b>Como funciona</b><span>Mediana móvel + desvio absoluto mediano (MAD). O algoritmo é determinístico e executado em Web Worker.</span></div>
            <button className="button danger-outline" onClick={injectAnomaly} disabled={!series.length}><Radio size={15}/> Injetar anomalia de teste</button>
          </div>
        </section>

        <section className="bottom-grid">
          <div className="panel event-panel">
            <div className="panel-header"><div><div className="panel-kicker">EVENT LOG</div><h2>Eventos detectados</h2></div><span className="count-badge">{summary.anomalies}</span></div>
            {processed.filter(p => p.anomaly).slice(-5).reverse().length ? processed.filter(p => p.anomaly).slice(-5).reverse().map((p,i) => <div className="event-row" key={p.date}><div className="event-icon"><AlertTriangle size={15}/></div><div><b>{injected && i === 0 ? "Evento de teste / pico" : "Desvio estatístico"}</b><span>{formatDate(p.date)} · {p.value} {variable.unit}</span></div><strong>{p.score > 0 ? "+" : ""}{p.score}σ</strong></div>) : <div className="empty-events"><CheckCircle2 size={19}/><span>Nenhuma anomalia acima do limiar foi identificada.</span></div>}
          </div>
          <div className="panel source-panel" id="data-source">
            <div className="panel-header"><div><div className="panel-kicker">DATA PROVENANCE</div><h2>Fontes & integridade</h2></div><Database size={18} className="muted-icon"/></div>
            <div className="source-row"><div className="source-icon"><Satellite size={16}/></div><div><b>NASA POWER</b><span>Parâmetros meteorológicos diários · API pública</span></div><a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer" aria-label="NASA POWER"><ExternalLink size={14}/></a></div>
            <div className="source-row"><div className="source-icon"><Globe2 size={16}/></div><div><b>NASA GIBS</b><span>Global Imagery Browse Services · tiles WMTS</span></div><a href="https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs" target="_blank" rel="noreferrer" aria-label="NASA GIBS"><ExternalLink size={14}/></a></div>
            <div className="source-row"><div className="source-icon"><Layers3 size={16}/></div><div><b>OpenStreetMap</b><span>Mapa-base e dados cartográficos</span></div><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" aria-label="OpenStreetMap"><ExternalLink size={14}/></a></div>
            <div className="provenance-note"><ShieldCheck size={15}/><span>{source === "NASA POWER" ? "Série obtida diretamente da API NASA POWER." : "A série atual é fixture local; confirme a origem antes de usar em decisões."}</span></div>
          </div>
        </section>

        <footer className="footer"><div>© 2026 HACKMIND · GEOSENTINEL <span>OPEN SOURCE / MIT</span></div><div>Ferramenta de auxílio à decisão. Não substitui validação científica ou laudo técnico.</div></footer>
      </main>
    </div>
  );
}

function Metric({icon,label,value,detail,tone}) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>;
}
function SlidersIcon() { return <Activity size={18} className="muted-icon"/>; }

createRoot(document.getElementById("root")).render(<App/>);
