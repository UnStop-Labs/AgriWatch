import { useEffect, useRef, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { analyzeIrrigation } from "../api/client";

const REFRESH_INTERVAL = 30; // seconds

const STATUS_META = {
  critical: { color: "#dc2626", label: "Irrigate Now",     icon: "🔴" },
  dry:      { color: "#f97316", label: "Needs Water",      icon: "🟠" },
  optimal:  { color: "#22c55e", label: "Optimal",          icon: "🟢" },
  wet:      { color: "#3b82f6", label: "Reduce Irrigation",icon: "🔵" },
};

// Thai demo presets
const PRESETS = [
  { label: "Chiang Rai Rice",    lat: 19.921,  lng: 99.832,  area: 52 },
  { label: "Chiang Mai Corn",    lat: 18.791,  lng: 98.970,  area: 68 },
  { label: "Suphan Buri Soy",    lat: 14.471,  lng: 100.131, area: 41 },
  { label: "Nakhon Pathom Veg",  lat: 13.823,  lng: 100.062, area: 24 },
];

function FlyTo({ target }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    if (target && target !== prev.current) {
      map.flyTo([target.lat, target.lng], 15, { duration: 1.4 });
      prev.current = target;
    }
  }, [target, map]);
  return null;
}

function Ring() {
  return (
    <div className="w-5 h-5 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
  );
}

export default function IrrigationAnalysis() {
  const [lat, setLat]   = useState("");
  const [lng, setLng]   = useState("");
  const [area, setArea] = useState("10");
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [satellite, setSatellite] = useState(true);
  const [activePreset, setActivePreset] = useState(null);

  const autoInterval = useRef(null);
  const cdInterval   = useRef(null);
  const activeParams = useRef(null);

  async function doAnalyze(latN, lngN, areaN, silent = false) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await analyzeIrrigation(latN, lngN, areaN);
      setData(result);
      setLastRefresh(new Date());
      setCountdown(REFRESH_INTERVAL);
    } catch (e) {
      setError(e.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  function startAutoRefresh(latN, lngN, areaN) {
    clearInterval(autoInterval.current);
    clearInterval(cdInterval.current);

    autoInterval.current = setInterval(() => doAnalyze(latN, lngN, areaN, true), REFRESH_INTERVAL * 1000);
    cdInterval.current   = setInterval(() => setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL : c - 1)), 1000);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    const areaN = parseFloat(area) || 10;
    if (isNaN(latN) || isNaN(lngN)) return;

    activeParams.current = { lat: latN, lng: lngN, area: areaN };
    setFlyTarget({ lat: latN, lng: lngN });
    doAnalyze(latN, lngN, areaN);
    startAutoRefresh(latN, lngN, areaN);
  }

  function handlePreset(p) {
    setLat(String(p.lat));
    setLng(String(p.lng));
    setArea(String(p.area));
    setActivePreset(p.label);
    activeParams.current = { lat: p.lat, lng: p.lng, area: p.area };
    setFlyTarget({ lat: p.lat, lng: p.lng });
    doAnalyze(p.lat, p.lng, p.area);
    startAutoRefresh(p.lat, p.lng, p.area);
  }

  useEffect(() => () => {
    clearInterval(autoInterval.current);
    clearInterval(cdInterval.current);
  }, []);

  const geojsonKey = lastRefresh?.toISOString();

  return (
    <div style={{ height: "calc(100vh - 64px)" }} className="flex flex-col">

      {/* ── Top control bar ── */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 space-y-3 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">🛰 Live Irrigation Analysis</h1>
            <p className="text-xs text-gray-400">Enter any plantation coordinates — map updates every {REFRESH_INTERVAL}s</p>
          </div>

          {/* Satellite / Street toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setSatellite(true)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${satellite ? "bg-white shadow text-gray-900" : "text-gray-500"}`}
            >
              🛰 Satellite
            </button>
            <button
              onClick={() => setSatellite(false)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${!satellite ? "bg-white shadow text-gray-900" : "text-gray-500"}`}
            >
              🗺 Street
            </button>
          </div>
        </div>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Latitude</label>
            <input
              type="number" step="any" placeholder="e.g. 18.791"
              value={lat} onChange={(e) => setLat(e.target.value)} required
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36 focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Longitude</label>
            <input
              type="number" step="any" placeholder="e.g. 98.970"
              value={lng} onChange={(e) => setLng(e.target.value)} required
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36 focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Area (ha)</label>
            <input
              type="number" min="1" max="500" step="1" placeholder="10"
              value={area} onChange={(e) => setArea(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24 focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50 transition-colors"
          >
            {loading ? <Ring /> : "🛰"}
            {loading ? "Analyzing…" : "Analyze Field"}
          </button>

          {/* Live refresh status */}
          {data && (
            <div className="flex items-center gap-2 ml-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <span className="text-xs text-gray-500">
                {loading ? "Refreshing…" : `Next refresh in ${countdown}s`}
              </span>
            </div>
          )}

          <p className="text-xs text-gray-400 self-end hidden sm:block">
            💡{" "}
            <a
              href="https://maps.google.com" target="_blank" rel="noopener noreferrer"
              className="text-green-600 hover:underline"
            >
              Google Maps → right-click → "What's here?"
            </a>
          </p>
        </form>

        {/* Thai farm presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">Thai farms:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activePreset === p.label
                  ? "bg-green-700 text-white border-green-700"
                  : "border-gray-300 text-gray-600 hover:border-green-500 hover:text-green-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Map ── */}
      <div className="flex-1 relative">
        <MapContainer
          center={[13.0, 101.0]}
          zoom={6}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
        >
          <FlyTo target={flyTarget} />

          {satellite ? (
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles © Esri — Maxar, GeoEye, Earthstar Geographics"
              maxZoom={19}
            />
          ) : (
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
          )}

          {/* Irrigation heatmap overlay */}
          {data && (
            <GeoJSON
              key={geojsonKey}
              data={data}
              style={(feature) => ({
                fillColor: feature.properties.color,
                fillOpacity: 0.62,
                color: "rgba(255,255,255,0.15)",
                weight: 0.5,
              })}
              onEachFeature={(feature, layer) => {
                const p = feature.properties;
                layer.on("mouseover", () => layer.setStyle({ fillOpacity: 0.85 }));
                layer.on("mouseout",  () => layer.setStyle({ fillOpacity: 0.62 }));
                layer.bindPopup(
                  `<div style="min-width:190px;font-family:sans-serif">
                    <p style="font-weight:700;font-size:13px;margin:0 0 4px">${STATUS_META[p.status]?.icon} ${STATUS_META[p.status]?.label}</p>
                    <p style="font-size:11px;color:#555;margin:0 0 8px">${p.recommendation}</p>
                    <table style="font-size:11px;width:100%;border-collapse:collapse">
                      <tr><td style="padding:2px 8px 2px 0;font-weight:600">Soil Moisture</td><td>${p.moisture_pct}%</td></tr>
                      <tr><td style="padding:2px 8px 2px 0;font-weight:600">NDVI</td><td>${p.ndvi}</td></tr>
                    </table>
                  </div>`,
                  { maxWidth: 220 }
                );
              }}
            />
          )}
        </MapContainer>

        {/* ── Loading overlay ── */}
        {loading && !data && (
          <div className="absolute inset-0 bg-black/25 flex items-center justify-center z-[1000]">
            <div className="bg-white rounded-2xl px-8 py-6 shadow-2xl flex flex-col items-center gap-3">
              <Ring />
              <p className="text-sm font-semibold text-gray-700">Fetching satellite data…</p>
              <p className="text-xs text-gray-400">Analyzing {area} ha field</p>
            </div>
          </div>
        )}

        {/* ── Subtle refresh flash ── */}
        {loading && data && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur rounded-full px-4 py-1.5 shadow flex items-center gap-2 text-xs text-gray-600">
            <Ring />
            Refreshing satellite data…
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-4 py-2 shadow">
            {error}
          </div>
        )}

        {/* ── Empty state ── */}
        {!data && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-[500] pointer-events-none">
            <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-8 text-center max-w-sm mx-4">
              <span className="text-5xl block mb-3">🛰️</span>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Enter Your Plantation Coordinates</h2>
              <p className="text-sm text-gray-500 mb-4">
                The map will show a real-time irrigation heatmap of your field — updated every {REFRESH_INTERVAL} seconds.
              </p>
              <p className="text-xs text-gray-400">
                Or click one of the Thai farm presets above to see a live demo.
              </p>
            </div>
          </div>
        )}

        {/* ── Summary panel (bottom-left) ── */}
        {data && (
          <div className="absolute bottom-5 left-5 z-[1000] bg-white/96 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 p-4 w-64">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Field Analysis</p>
              <p className="text-xs text-gray-400">{data.summary.area_ha} ha</p>
            </div>
            <div className="space-y-2.5">
              {Object.entries(STATUS_META).map(([key, meta]) => {
                const pct = data.summary[`${key}_pct`] ?? 0;
                return (
                  <div key={key}>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs text-gray-600">{meta.icon} {meta.label}</span>
                      <span className="text-xs font-bold" style={{ color: meta.color }}>{pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: meta.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">Last updated</span>
              <span className="text-xs font-medium text-gray-600">
                {lastRefresh?.toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}

        {/* ── Legend (top-right) ── */}
        <div className="absolute top-4 right-4 z-[1000] bg-white/96 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 p-3">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Irrigation Need</p>
          {Object.values(STATUS_META).map(({ color, label, icon }) => (
            <div key={label} className="flex items-center gap-2 text-xs text-gray-600 mb-1.5 last:mb-0">
              <span
                className="w-3.5 h-3.5 rounded-sm shrink-0"
                style={{ background: color, opacity: 0.75 }}
              />
              <span>{icon} {label}</span>
            </div>
          ))}
          <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
            Click any cell for details
          </p>
        </div>
      </div>
    </div>
  );
}
