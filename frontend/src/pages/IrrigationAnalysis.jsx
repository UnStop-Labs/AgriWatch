import { useEffect, useRef, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { analyzeIrrigation } from "../api/client";
import { useLang } from "../context/LangContext";

const REFRESH_INTERVAL = 30;
const RAI_TO_HA = 0.16; // 1 rai = 1,600 m² = 0.16 ha
const STATUS_COLORS = { critical: "#dc2626", dry: "#f97316", optimal: "#22c55e", wet: "#3b82f6" };

const STATUS_META = {
  critical: { icon: "🔴", label: "Critical – Irrigate Now", color: "#dc2626" },
  dry:      { icon: "🟠", label: "Dry – Irrigate Soon",    color: "#f97316" },
  optimal:  { icon: "🟢", label: "Optimal",                color: "#22c55e" },
  wet:      { icon: "🔵", label: "Wet – No Irrigation",    color: "#3b82f6" },
};

// Presets in rai
const PRESETS = [
  { label: "Chiang Rai Rice",    lat: 19.921,  lng: 99.832,  areaRai: 325 },
  { label: "Chiang Mai Corn",    lat: 18.791,  lng: 98.970,  areaRai: 425 },
  { label: "Suphan Buri Soy",    lat: 14.471,  lng: 100.131, areaRai: 256 },
  { label: "Nakhon Pathom Veg",  lat: 13.823,  lng: 100.062, areaRai: 150 },
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
  const { t } = useLang();
  const [lat, setLat]   = useState("");
  const [lng, setLng]   = useState("");
  const [areaRai, setAreaRai] = useState("10"); // stored in rai
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
    const raiN = parseFloat(areaRai) || 10;
    const haN  = raiN * RAI_TO_HA;
    if (isNaN(latN) || isNaN(lngN)) return;

    activeParams.current = { lat: latN, lng: lngN, area: haN, areaRai: raiN };
    setFlyTarget({ lat: latN, lng: lngN });
    doAnalyze(latN, lngN, haN);
    startAutoRefresh(latN, lngN, haN);
  }

  function handlePreset(p) {
    const haN = p.areaRai * RAI_TO_HA;
    setLat(String(p.lat));
    setLng(String(p.lng));
    setAreaRai(String(p.areaRai));
    setActivePreset(p.label);
    activeParams.current = { lat: p.lat, lng: p.lng, area: haN, areaRai: p.areaRai };
    setFlyTarget({ lat: p.lat, lng: p.lng });
    doAnalyze(p.lat, p.lng, haN);
    startAutoRefresh(p.lat, p.lng, haN);
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
            <h1 className="text-lg font-bold text-gray-900">{t("irr_title")}</h1>
            <p className="text-xs text-gray-400">{t("irr_subtitle", { n: REFRESH_INTERVAL })}</p>
          </div>

          {/* Satellite / Street toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setSatellite(true)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${satellite ? "bg-white shadow text-gray-900" : "text-gray-500"}`}
            >
              {t("irr_satellite")}
            </button>
            <button
              onClick={() => setSatellite(false)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${!satellite ? "bg-white shadow text-gray-900" : "text-gray-500"}`}
            >
              {t("irr_street")}
            </button>
          </div>
        </div>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("irr_lat")}</label>
            <input
              type="number" step="any" placeholder="e.g. 18.791"
              value={lat} onChange={(e) => setLat(e.target.value)} required
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36 focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("irr_lng")}</label>
            <input
              type="number" step="any" placeholder="e.g. 98.970"
              value={lng} onChange={(e) => setLng(e.target.value)} required
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36 focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("irr_area")}</label>
            <input
              type="number" min="1" max="3000" step="1" placeholder="10"
              value={areaRai} onChange={(e) => setAreaRai(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28 focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50 transition-colors"
          >
            {loading ? <Ring /> : "🛰"}
            {loading ? t("irr_analyzing") : t("irr_analyze")}
          </button>

          {/* Live refresh status */}
          {data && (
            <div className="flex items-center gap-2 ml-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <span className="text-xs text-gray-500">
                {loading ? t("irr_refreshing") : t("irr_next_refresh", { n: countdown })}
              </span>
            </div>
          )}

          <p className="text-xs text-gray-400 self-end hidden sm:block">
            💡{" "}
            <a
              href="https://maps.google.com" target="_blank" rel="noopener noreferrer"
              className="text-green-600 hover:underline"
            >
              {t("irr_gmaps_hint")}
            </a>
          </p>
        </form>

        {/* Thai farm presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">{t("irr_thai_farms")}</span>
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
              <p className="text-sm font-semibold text-gray-700">{t("irr_fetching")}</p>
              <p className="text-xs text-gray-400">{t("irr_analyzing_n", { n: areaRai })}</p>
            </div>
          </div>
        )}

        {/* ── Subtle refresh flash ── */}
        {loading && data && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur rounded-full px-4 py-1.5 shadow flex items-center gap-2 text-xs text-gray-600">
            <Ring />
            {t("irr_refreshing")}
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
              <h2 className="text-lg font-bold text-gray-900 mb-2">{t("irr_empty_title")}</h2>
              <p className="text-sm text-gray-500 mb-4">{t("irr_empty_desc", { n: REFRESH_INTERVAL })}</p>
              <p className="text-xs text-gray-400">{t("irr_empty_hint")}</p>
            </div>
          </div>
        )}

        {/* ── Summary panel (bottom-left) ── */}
        {data && (
          <div className="absolute bottom-5 left-5 z-[1000] bg-white/96 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 p-4 w-64">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">{t("irr_summary_title")}</p>
              <p className="text-xs text-gray-400">{activeParams.current?.areaRai ?? data.summary.area_ha} {t("irr_area")}</p>
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
              <span className="text-xs text-gray-400">{t("irr_last_updated")}</span>
              <span className="text-xs font-medium text-gray-600">
                {lastRefresh?.toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}

        {/* ── Legend (top-right) ── */}
        <div className="absolute top-4 right-4 z-[1000] bg-white/96 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 p-3">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">{t("irr_legend_title")}</p>
          {[
            { color: "#dc2626", key: "critical" },
            { color: "#f97316", key: "dry" },
            { color: "#22c55e", key: "optimal" },
            { color: "#3b82f6", key: "wet" },
          ].map(({ color, key }) => (
            <div key={key} className="flex items-center gap-2 text-xs text-gray-600 mb-1.5 last:mb-0">
              <span className="w-3.5 h-3.5 rounded-sm shrink-0" style={{ background: color, opacity: 0.75 }} />
              <span>{t(`irr_${key}`)}</span>
            </div>
          ))}
          <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">{t("irr_click_cell")}</p>
        </div>
      </div>
    </div>
  );
}
