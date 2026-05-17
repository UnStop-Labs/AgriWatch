import { subDays } from "date-fns";
import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { acknowledgeAlert, getAlerts, getField, getFieldIntelligence, getReadings, seedField } from "../api/client";
import AlertTypeIcon from "../components/AlertTypeIcon";
import HealthBadge from "../components/HealthBadge";
import SeverityChip from "../components/SeverityChip";
import { usePolling } from "../hooks/usePolling";
import { useLang } from "../context/LangContext";

const RANGES = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

function fmt(ts) {
  const d = new Date(ts + "Z");
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtShort(ts) {
  const d = new Date(ts + "Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const CustomTooltip = ({ active, payload, label, extra }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
      <p className="text-gray-500 mb-1">{fmt(label)}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(3) : p.value}
          {extra}
        </p>
      ))}
    </div>
  );
};

export default function FieldDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();
  const [range, setRange] = useState(7);
  const [seeding, setSeeding] = useState(false);

  const fetchField = useCallback(() => getField(Number(id)), [id]);
  const fetchReadings = useCallback(() => {
    const from = subDays(new Date(), range).toISOString();
    return getReadings(Number(id), from, null, 1000);
  }, [id, range]);
  const fetchAlerts = useCallback(
    () => getAlerts({ field_id: Number(id), limit: 100 }),
    [id]
  );

  const fetchIntel = useCallback(() => getFieldIntelligence(Number(id)), [id]);

  const { data: field, refresh: refreshField } = usePolling(fetchField, 60000);
  const { data: readings, refresh: refreshReadings } = usePolling(fetchReadings, 60000, [range]);
  const { data: alerts, refresh: refreshAlerts } = usePolling(fetchAlerts, 30000);
  const { data: intel, refresh: refreshIntel } = usePolling(fetchIntel, 60000);

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedField(Number(id), 30);
      refreshField();
      refreshReadings();
      refreshAlerts();
      refreshIntel();
    } finally {
      setSeeding(false);
    }
  }

  function fmt$(n) {
    if (n == null) return "—";
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
    return `$${Math.round(n)}`;
  }

  async function handleAck(alertId) {
    await acknowledgeAlert(alertId);
    refreshAlerts();
  }

  const chartData = readings?.map((r) => ({
    ts: r.timestamp,
    ndvi: r.data_quality !== "missing" ? r.ndvi : null,
    soil: r.data_quality !== "missing" ? r.soil_moisture : null,
    temp: r.data_quality !== "missing" ? r.surface_temp_c : null,
  }));

  if (!field) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-gray-500 text-sm">{t("fd_loading")}</div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate("/fields")}
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
          >
            {t("fd_back")}
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{field.name}</h1>
          <p className="text-sm text-gray-500 mt-1 capitalize">
            {field.crop_type} · {field.area_ha} ha
          </p>
        </div>
        <div className="flex items-center gap-3">
          <HealthBadge status={field.health_status} />
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {seeding ? t("fd_seeding") : t("fd_reseed")}
          </button>
        </div>
      </div>

      {/* Metric chips */}
      <div className="flex gap-4 flex-wrap">
        {[
          { label: t("fd_ndvi"), value: field.latest_ndvi?.toFixed(3) },
          { label: t("fd_soil_moisture"), value: field.latest_soil_moisture != null ? `${field.latest_soil_moisture.toFixed(1)}%` : null },
          { label: t("fd_surface_temp"), value: field.latest_temp_c != null ? `${field.latest_temp_c.toFixed(1)}°C` : null },
          { label: t("fd_active_alerts"), value: String(field.active_alert_count) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">{value ?? "—"}</div>
          </div>
        ))}
      </div>

      {/* Intelligence Panel */}
      {intel && (
        <div className="space-y-4">
          {/* Financial summary row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: t("fd_yield_forecast"), value: `${intel.yield_forecast_tons}t`, sub: `${intel.yield_forecast_tons_ha} t/ha`, color: intel.yield_vs_baseline_pct >= 0 ? "text-green-600" : "text-red-600" },
              { label: t("fd_water_savings"), value: fmt$(intel.water_savings_usd), sub: `${intel.water_savings_m3.toLocaleString()} m³`, color: "text-blue-600" },
              { label: t("fd_input_savings"), value: fmt$(intel.fertilizer_savings_usd + intel.spray_savings_usd), sub: `${intel.fertilizer_savings_kg} kg fertilizer`, color: "text-amber-600" },
              { label: t("fd_total_roi"), value: fmt$(intel.total_savings_usd), sub: t("fd_this_season"), color: "text-purple-600" },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* Harvest timing */}
          {intel.harvest_status !== "unknown" && (
            <div className={`rounded-xl border px-5 py-4 flex items-center justify-between ${
              intel.harvest_status === "overdue" ? "bg-red-50 border-red-300" :
              intel.harvest_status === "imminent" ? "bg-orange-50 border-orange-300" :
              "bg-green-50 border-green-200"
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">🌾</span>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">
                    {intel.harvest_status === "overdue" && t("fd_harvest_overdue", { n: Math.abs(intel.days_to_harvest) })}
                    {intel.harvest_status === "imminent" && t("fd_harvest_imminent", { n: intel.days_to_harvest })}
                    {intel.harvest_status === "upcoming" && t("fd_harvest_upcoming", { n: intel.days_to_harvest })}
                    {intel.harvest_status === "on_track" && t("fd_harvest_on_track", { n: intel.days_to_harvest })}
                  </p>
                  {intel.harvest_due && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t("fd_expected")} {new Date(intel.harvest_due).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              {intel.harvest_status === "overdue" && (
                <span className="text-xs bg-red-500 text-white px-3 py-1 rounded-full font-bold">{t("fd_action_required")}</span>
              )}
            </div>
          )}

          {/* Recommendations */}
          {intel.recommendations?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">{t("fd_ai_recs")}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{t("fd_by_impact")}</p>
              </div>
              <ul className="divide-y divide-gray-50">
                {intel.recommendations.map((r, i) => (
                  <li key={i} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            r.priority === "high" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                          }`}>
                            {r.priority}
                          </span>
                          <span className="text-xs text-gray-400 capitalize">{r.type.replace("_", " ")}</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                        <p className="text-xs text-gray-500 mt-1">{r.reason}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs">→</span>
                          <p className="text-xs font-medium text-green-700">{r.action}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-bold text-green-600">{fmt$(r.financial_impact_usd)}</p>
                        <p className="text-xs text-gray-400">{t("fd_potential")}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Time range selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">{t("fd_time_range")}</span>
        {RANGES.map(({ label, days }) => (
          <button
            key={label}
            onClick={() => setRange(days)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              range === days
                ? "bg-green-700 text-white"
                : "border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="space-y-4">
        {/* NDVI */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">{t("fd_ndvi_chart")}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} syncId="field-charts">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="ts" tickFormatter={fmtShort} tick={{ fontSize: 11 }} minTickGap={40} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} width={40} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0.30} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "Critical", fill: "#ef4444", fontSize: 10 }} />
              <ReferenceLine y={0.50} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: "Warning", fill: "#f59e0b", fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="ndvi"
                name="NDVI"
                stroke="#16a34a"
                dot={false}
                strokeWidth={2}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Soil Moisture */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">{t("fd_soil_chart")}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} syncId="field-charts">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="ts" tickFormatter={fmtShort} tick={{ fontSize: 11 }} minTickGap={40} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={40} />
              <Tooltip content={<CustomTooltip extra="%" />} />
              <ReferenceLine y={15} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "Dry", fill: "#ef4444", fontSize: 10 }} />
              <ReferenceLine y={60} stroke="#3b82f6" strokeDasharray="4 2" label={{ value: "Waterlogged", fill: "#3b82f6", fontSize: 10 }} />
              <Area
                type="monotone"
                dataKey="soil"
                name="Soil Moisture"
                stroke="#3b82f6"
                fill="#dbeafe"
                dot={false}
                strokeWidth={2}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Temperature */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">{t("fd_temp_chart")}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} syncId="field-charts">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="ts" tickFormatter={fmtShort} tick={{ fontSize: 11 }} minTickGap={40} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip content={<CustomTooltip extra="°C" />} />
              <ReferenceLine y={38} stroke="#f97316" strokeDasharray="4 2" label={{ value: "Heat stress", fill: "#f97316", fontSize: 10 }} />
              <ReferenceLine y={2} stroke="#60a5fa" strokeDasharray="4 2" label={{ value: "Frost", fill: "#60a5fa", fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="temp"
                name="Temperature"
                stroke="#f97316"
                dot={false}
                strokeWidth={2}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alert History */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{t("fd_alert_history")}</h3>
          <span className="text-xs text-gray-400">{t("fd_alerts_count", { n: alerts?.length ?? 0 })}</span>
        </div>
        {!alerts || alerts.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">{t("fd_no_alerts")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <th className="px-6 py-2 text-left">{t("fd_col_type")}</th>
                  <th className="px-4 py-2 text-left">{t("fd_col_severity")}</th>
                  <th className="px-4 py-2 text-left">{t("fd_col_message")}</th>
                  <th className="px-4 py-2 text-left">{t("fd_col_triggered")}</th>
                  <th className="px-4 py-2 text-center">{t("fd_col_status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {alerts.map((a) => (
                  <tr key={a.id} className={a.acknowledged ? "opacity-50" : ""}>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <AlertTypeIcon type={a.alert_type} />
                        <span className="text-xs text-gray-600">{a.alert_type.replace(/_/g, " ")}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <SeverityChip severity={a.severity} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">{a.message}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmt(a.triggered_at)}</td>
                    <td className="px-4 py-3 text-center">
                      {a.acknowledged ? (
                        <span className="text-xs text-gray-400">{t("fd_acknowledged")}</span>
                      ) : (
                        <button
                          onClick={() => handleAck(a.id)}
                          className="text-xs text-green-700 hover:underline font-medium"
                        >
                          {t("fd_acknowledge")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
