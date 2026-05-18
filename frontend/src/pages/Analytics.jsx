import { useEffect, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { getDisease, getFields, getYieldPrediction } from "../api/client";
import { useLang } from "../context/LangContext";

function Spinner() {
  return <div className="w-5 h-5 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />;
}

function Sparkline({ data, valueKey, color = "#16a34a", height = 60 }) {
  if (!data || data.length < 2) return null;
  const vals = data.map((d) => d[valueKey]);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const range = mx - mn || 1;
  const W = 260;
  const H = height;
  const pts = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * W;
      const y = H - ((v - mn) / range) * (H - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${H} ${pts} ${W},${H}`}
        fill={`url(#grad-${valueKey})`}
      />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function FlyToBounds({ features }) {
  const map = useMap();
  useEffect(() => {
    if (!features || features.length === 0) return;
    const lats = [], lngs = [];
    features.forEach((f) => {
      f.geometry.coordinates[0].forEach(([lng, lat]) => {
        lats.push(lat);
        lngs.push(lng);
      });
    });
    if (lats.length) {
      const bounds = [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ];
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [features, map]);
  return null;
}

function ScoreGauge({ score, color = "#16a34a", label }) {
  const r = 36, circ = 2 * Math.PI * r;
  const fill = circ * (score / 100);
  return (
    <div className="flex flex-col items-center">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 44 44)"
        />
        <text x="44" y="48" textAnchor="middle" fontSize="18" fontWeight="bold" fill="#111827">{score}</text>
      </svg>
      <span className="text-xs text-gray-500 mt-1">{label}</span>
    </div>
  );
}

const RISK_CFG = {
  low:      { cls: "bg-green-100 text-green-700 border-green-200",   label: "Low Risk" },
  moderate: { cls: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Moderate Risk" },
  high:     { cls: "bg-orange-100 text-orange-700 border-orange-200", label: "High Risk" },
  critical: { cls: "bg-red-100 text-red-700 border-red-200",         label: "Critical Risk" },
};

const SEVERITY_CFG = {
  high:   "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low:    "bg-blue-100 text-blue-700",
};

export default function Analytics() {
  const { t } = useLang();
  const [fields, setFields] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("disease"); // "disease" | "yield"
  const [disease, setDisease] = useState(null);
  const [yieldData, setYieldData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [satellite, setSatellite] = useState(true);

  useEffect(() => {
    getFields().then((fs) => {
      setFields(fs || []);
      if (fs && fs.length > 0) setSelectedId(fs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setDisease(null);
    setYieldData(null);
    Promise.all([getDisease(selectedId), getYieldPrediction(selectedId)])
      .then(([d, y]) => { setDisease(d); setYieldData(y); })
      .finally(() => setLoading(false));
  }, [selectedId]);

  const activeData = tab === "disease" ? disease : yieldData;
  const heatmap = activeData?.heatmap;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("an_title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("an_subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Field selector */}
          <select
            value={selectedId || ""}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:outline-none bg-white"
          >
            {fields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {/* Layer toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setSatellite(true)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${satellite ? "bg-white shadow text-gray-900" : "text-gray-500"}`}>
              🛰 {t("an_satellite")}
            </button>
            <button onClick={() => setSatellite(false)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${!satellite ? "bg-white shadow text-gray-900" : "text-gray-500"}`}>
              🗺 {t("an_street")}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("disease")}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === "disease" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
        >
          🦠 {t("an_tab_disease")}
        </button>
        <button
          onClick={() => setTab("yield")}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === "yield" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
        >
          📈 {t("an_tab_yield")}
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-sm text-gray-500 py-4">
          <Spinner /> {t("an_loading")}
        </div>
      )}

      {/* ── DISEASE TAB ── */}
      {!loading && tab === "disease" && disease && (
        <div className="space-y-4">
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center">
              <ScoreGauge
                score={disease.health_score}
                color={disease.health_score >= 70 ? "#16a34a" : disease.health_score >= 50 ? "#f59e0b" : "#dc2626"}
                label={t("an_health_score")}
              />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-center gap-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide">{t("an_risk_level")}</p>
              <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold w-fit ${RISK_CFG[disease.risk_level]?.cls}`}>
                {t(`an_risk_${disease.risk_level}`)}
              </span>
              <p className="text-2xl font-bold text-gray-900">{disease.disease_risk_pct}%</p>
              <p className="text-xs text-gray-400">{t("an_disease_risk")}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-center gap-1">
              <p className="text-xs text-gray-400 uppercase tracking-wide">NDVI</p>
              <p className="text-2xl font-bold text-gray-900">{disease.avg_ndvi}</p>
              <p className="text-xs text-gray-400">{t("an_30d_avg")}</p>
              <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${Math.min(100, disease.avg_ndvi * 125)}%` }} />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-center gap-1">
              <p className="text-xs text-gray-400 uppercase tracking-wide">{t("an_detected_stress")}</p>
              <p className="text-2xl font-bold text-gray-900">{disease.detected_stress.length}</p>
              <p className="text-xs text-gray-400">{t("an_stress_types")}</p>
            </div>
          </div>

          {/* Map + Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Map */}
            <div className="lg:col-span-2 h-[420px] rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              <MapContainer center={[15, 100]} zoom={6} style={{ height: "100%", width: "100%" }}>
                <FlyToBounds features={heatmap?.features} />
                {satellite ? (
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution="Tiles © Esri" maxZoom={19}
                  />
                ) : (
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='© OpenStreetMap'
                  />
                )}
                {heatmap && (
                  <GeoJSON
                    key={disease.analyzed_at}
                    data={heatmap}
                    style={(f) => ({ fillColor: f.properties.color, fillOpacity: 0.6, color: "rgba(255,255,255,0.2)", weight: 0.5 })}
                    onEachFeature={(f, layer) => {
                      layer.on("mouseover", () => layer.setStyle({ fillOpacity: 0.85 }));
                      layer.on("mouseout",  () => layer.setStyle({ fillOpacity: 0.6 }));
                      layer.bindPopup(
                        `<div style="font-family:sans-serif;min-width:160px">
                          <p style="font-weight:700;margin:0 0 4px;text-transform:capitalize">${f.properties.status}</p>
                          <p style="font-size:11px;color:#555;margin:0">Risk score: ${f.properties.risk_pct}%</p>
                        </div>`,
                        { maxWidth: 200 }
                      );
                    }}
                  />
                )}
              </MapContainer>
            </div>

            {/* Side panel */}
            <div className="space-y-4">
              {/* Legend */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">{t("an_legend")}</p>
                {[
                  { color: "#16a34a", label: t("an_healthy"), key: "healthy" },
                  { color: "#eab308", label: t("an_watch"),   key: "watch" },
                  { color: "#f97316", label: t("an_stressed"), key: "stressed" },
                  { color: "#dc2626", label: t("an_critical"), key: "critical" },
                ].map(({ color, label, key }) => (
                  <div key={key} className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-sm" style={{ background: color, opacity: 0.75 }} />
                      {label}
                    </div>
                    <span className="font-semibold text-gray-700">{disease.heatmap_summary?.[key] ?? 0}%</span>
                  </div>
                ))}
              </div>

              {/* Detected stress */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">{t("an_detected_stress")}</p>
                {disease.detected_stress.length === 0 ? (
                  <p className="text-sm text-green-600 font-medium">✓ {t("an_no_stress")}</p>
                ) : (
                  <div className="space-y-3">
                    {disease.detected_stress.map((s) => (
                      <div key={s.id} className="border border-gray-100 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-800">{s.icon} {s.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${SEVERITY_CFG[s.severity]}`}>
                            {s.severity}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{s.affected_area_pct}% {t("an_area_affected")}</span>
                          <span>·</span>
                          <span>{Math.round(s.confidence * 100)}% {t("an_confidence")}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 italic">{s.recommendation}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Trend chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-1">{t("an_health_trend")}</p>
            <p className="text-xs text-gray-400 mb-3">{t("an_14d")}</p>
            <Sparkline data={disease.trend} valueKey="health_score" color="#16a34a" height={64} />
            <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
              <span>{disease.trend[0]?.date}</span>
              <span>{disease.trend[disease.trend.length - 1]?.date}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── YIELD TAB ── */}
      {!loading && tab === "yield" && yieldData && (
        <div className="space-y-4">
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">🌾 {t("an_total_yield")}</p>
              <p className="text-2xl font-bold text-gray-900">{yieldData.yield_forecast_total_tons}t</p>
              <p className="text-xs text-gray-500">{yieldData.yield_forecast_tons_ha}t/ha</p>
              <p className={`text-xs font-semibold mt-1 ${yieldData.vs_baseline_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                {yieldData.vs_baseline_pct >= 0 ? "+" : ""}{yieldData.vs_baseline_pct}% {t("an_vs_baseline")}
              </p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-xl border border-blue-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">🎯 {t("an_confidence")}</p>
              <p className="text-2xl font-bold text-gray-900">{yieldData.confidence_pct}%</p>
              <div className="h-2 bg-blue-100 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${yieldData.confidence_pct}%` }} />
              </div>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl border border-amber-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">⭐ {t("an_quality")}</p>
              <ScoreGauge score={yieldData.quality_score} color="#f59e0b" label={t("an_quality_score")} />
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl border border-purple-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">📅 {t("an_harvest")}</p>
              <p className="text-2xl font-bold text-gray-900">
                {yieldData.days_to_harvest != null
                  ? yieldData.days_to_harvest < 0
                    ? t("an_overdue")
                    : `${yieldData.days_to_harvest}d`
                  : "—"}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {yieldData.harvest_date ? new Date(yieldData.harvest_date).toLocaleDateString() : t("an_no_date")}
              </p>
            </div>
          </div>

          {/* Map + Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Map */}
            <div className="lg:col-span-2 h-[420px] rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              <MapContainer center={[15, 100]} zoom={6} style={{ height: "100%", width: "100%" }}>
                <FlyToBounds features={yieldData.heatmap?.features} />
                {satellite ? (
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution="Tiles © Esri" maxZoom={19}
                  />
                ) : (
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='© OpenStreetMap'
                  />
                )}
                {yieldData.heatmap && (
                  <GeoJSON
                    key={yieldData.analyzed_at}
                    data={yieldData.heatmap}
                    style={(f) => ({ fillColor: f.properties.color, fillOpacity: 0.6, color: "rgba(255,255,255,0.2)", weight: 0.5 })}
                    onEachFeature={(f, layer) => {
                      layer.on("mouseover", () => layer.setStyle({ fillOpacity: 0.85 }));
                      layer.on("mouseout",  () => layer.setStyle({ fillOpacity: 0.6 }));
                      layer.bindPopup(
                        `<div style="font-family:sans-serif;min-width:160px">
                          <p style="font-weight:700;margin:0 0 4px;text-transform:capitalize">${f.properties.zone} productivity</p>
                          <p style="font-size:11px;color:#555;margin:0">Index: ${f.properties.productivity}%</p>
                        </div>`,
                        { maxWidth: 200 }
                      );
                    }}
                  />
                )}
              </MapContainer>
            </div>

            {/* Side panel */}
            <div className="space-y-4">
              {/* Zone breakdown */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">{t("an_zone_breakdown")}</p>
                {[
                  { key: "high",   color: "#16a34a", label: t("an_zone_high") },
                  { key: "medium", color: "#84cc16", label: t("an_zone_medium") },
                  { key: "low",    color: "#f97316", label: t("an_zone_low") },
                ].map(({ key, color, label }) => {
                  const pct = yieldData.zone_pct?.[key] ?? 0;
                  return (
                    <div key={key} className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                          {label}
                        </span>
                        <span className="font-bold" style={{ color }}>{pct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Revenue estimate */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">{t("an_revenue_est")}</p>
                <p className="text-2xl font-bold text-green-600">
                  ${yieldData.revenue_estimate_usd >= 1000
                    ? `${(yieldData.revenue_estimate_usd / 1000).toFixed(1)}k`
                    : yieldData.revenue_estimate_usd}
                </p>
                <p className="text-xs text-gray-400 mt-1">{t("an_estimated_season")}</p>
              </div>

              {/* Yield legend */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">{t("an_productivity_map")}</p>
                {[
                  { color: "#16a34a", label: t("an_zone_high") },
                  { color: "#84cc16", label: t("an_zone_medium") },
                  { color: "#f97316", label: t("an_zone_low") },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2 text-xs text-gray-600 mb-1.5">
                    <span className="w-3.5 h-3.5 rounded-sm" style={{ background: color, opacity: 0.75 }} />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Trend chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-1">{t("an_yield_trend")}</p>
            <p className="text-xs text-gray-400 mb-3">{t("an_14d")}</p>
            <Sparkline data={yieldData.trend} valueKey="yield_ha" color="#16a34a" height={64} />
            <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
              <span>{yieldData.trend[0]?.date}</span>
              <span>{yieldData.trend[yieldData.trend.length - 1]?.date}</span>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !activeData && (
        <div className="text-center py-16 text-gray-400">
          <span className="text-5xl block mb-3">🔬</span>
          <p className="text-lg font-semibold">{t("an_empty_title")}</p>
          <p className="text-sm mt-1">{t("an_empty_sub")}</p>
        </div>
      )}
    </div>
  );
}
