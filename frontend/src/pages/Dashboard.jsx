import { formatDistanceToNow } from "date-fns";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { acknowledgeAlert, getAlerts, getReadingsSummary, triggerIngest } from "../api/client";
import AlertTypeIcon from "../components/AlertTypeIcon";
import HealthBadge from "../components/HealthBadge";
import SeverityChip from "../components/SeverityChip";
import StatCard from "../components/StatCard";
import { usePolling } from "../hooks/usePolling";

function ndviColor(v) {
  if (v == null) return "text-gray-400";
  if (v >= 0.55) return "text-green-600";
  if (v >= 0.40) return "text-yellow-600";
  if (v >= 0.25) return "text-orange-600";
  return "text-red-600";
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [ingesting, setIngesting] = useState(false);

  const fetchSummary = useCallback(() => getReadingsSummary(), []);
  const fetchAlerts = useCallback(() => getAlerts({ acknowledged: false, limit: 10 }), []);

  const { data: summary, refresh: refreshSummary } = usePolling(fetchSummary, 60000);
  const { data: alerts, refresh: refreshAlerts } = usePolling(fetchAlerts, 30000);

  const avgNdvi =
    summary && summary.length
      ? (summary.reduce((s, f) => s + (f.latest_ndvi ?? 0), 0) / summary.filter((f) => f.latest_ndvi != null).length)
      : null;

  const criticalFields = summary?.filter((f) => f.health_status === "critical").length ?? 0;
  const totalAlerts = alerts?.length ?? 0;

  async function handleIngest() {
    setIngesting(true);
    try {
      await triggerIngest();
      refreshSummary();
      refreshAlerts();
    } finally {
      setIngesting(false);
    }
  }

  async function handleAck(e, id) {
    e.stopPropagation();
    await acknowledgeAlert(id);
    refreshAlerts();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time field monitoring overview</p>
        </div>
        <button
          onClick={handleIngest}
          disabled={ingesting}
          className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50 transition-colors"
        >
          {ingesting ? "Ingesting…" : "⟳ Ingest Now"}
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Fields Monitored"
          value={summary?.length ?? "—"}
          icon="🗺️"
          color="green"
        />
        <StatCard
          title="Active Alerts"
          value={totalAlerts}
          icon="🔔"
          color={totalAlerts > 0 ? "red" : "green"}
          subtitle={totalAlerts > 0 ? "Needs attention" : "All clear"}
        />
        <StatCard
          title="Average NDVI"
          value={avgNdvi != null ? avgNdvi.toFixed(3) : "—"}
          icon="🌿"
          color={avgNdvi == null ? "gray" : avgNdvi >= 0.5 ? "green" : avgNdvi >= 0.3 ? "yellow" : "red"}
          subtitle="Vegetation index"
        />
        <StatCard
          title="Critical Fields"
          value={criticalFields}
          icon="⚠️"
          color={criticalFields > 0 ? "red" : "green"}
          subtitle={criticalFields > 0 ? "Urgent inspection" : "None"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alert Feed */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Recent Alerts</h2>
            <button
              onClick={() => navigate("/alerts")}
              className="text-sm text-green-700 hover:underline"
            >
              View all →
            </button>
          </div>
          {!alerts || alerts.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">
              No active alerts — all fields are healthy
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="px-6 py-3 hover:bg-gray-50 cursor-pointer flex items-start gap-3"
                  onClick={() => navigate(`/fields/${a.field_id}`)}
                >
                  <AlertTypeIcon type={a.alert_type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">{a.field_name}</span>
                      <SeverityChip severity={a.severity} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{a.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDistanceToNow(new Date(a.triggered_at + "Z"), { addSuffix: true })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleAck(e, a.id)}
                    className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap"
                  >
                    Dismiss
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Field Health Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Field Health</h2>
            <button
              onClick={() => navigate("/fields")}
              className="text-sm text-green-700 hover:underline"
            >
              Manage fields →
            </button>
          </div>
          {!summary || summary.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">No fields yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    <th className="px-6 py-2 text-left">Field</th>
                    <th className="px-4 py-2 text-right">NDVI</th>
                    <th className="px-4 py-2 text-right">Moisture</th>
                    <th className="px-4 py-2 text-right">Temp</th>
                    <th className="px-4 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {summary.map((f) => (
                    <tr
                      key={f.field_id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/fields/${f.field_id}`)}
                    >
                      <td className="px-6 py-3">
                        <div className="font-medium text-gray-900">{f.field_name}</div>
                        <div className="text-xs text-gray-400 capitalize">{f.crop_type}</div>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${ndviColor(f.latest_ndvi)}`}>
                        {f.latest_ndvi?.toFixed(3) ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {f.latest_soil_moisture != null ? `${f.latest_soil_moisture.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {f.latest_temp_c != null ? `${f.latest_temp_c.toFixed(1)}°C` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <HealthBadge status={f.health_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
