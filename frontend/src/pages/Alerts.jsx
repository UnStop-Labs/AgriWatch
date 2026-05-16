import { formatDistanceToNow } from "date-fns";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  acknowledgeAlert,
  acknowledgeAll,
  getAlertStats,
  getAlerts,
  getFields,
} from "../api/client";
import AlertTypeIcon from "../components/AlertTypeIcon";
import SeverityChip from "../components/SeverityChip";
import { usePolling } from "../hooks/usePolling";

const SEVERITIES = ["", "critical", "high", "medium", "low"];

export default function Alerts() {
  const navigate = useNavigate();
  const [fieldFilter, setFieldFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const fetchFields = useCallback(() => getFields(), []);
  const { data: fields } = usePolling(fetchFields, 120000);

  const fetchAlerts = useCallback(() => {
    const filters = { limit: 200 };
    if (fieldFilter) filters.field_id = fieldFilter;
    if (severityFilter) filters.severity = severityFilter;
    if (!showAcknowledged) filters.acknowledged = false;
    return getAlerts(filters);
  }, [fieldFilter, severityFilter, showAcknowledged]);

  const { data: alerts, refresh: refreshAlerts } = usePolling(fetchAlerts, 30000, [
    fieldFilter,
    severityFilter,
    showAcknowledged,
  ]);

  const fetchStats = useCallback(() => getAlertStats(), []);
  const { data: stats, refresh: refreshStats } = usePolling(fetchStats, 30000);

  async function handleAck(id) {
    await acknowledgeAlert(id);
    refreshAlerts();
    refreshStats();
  }

  async function handleAckAll() {
    if (!confirm("Acknowledge all visible alerts?")) return;
    await acknowledgeAll(fieldFilter || undefined);
    refreshAlerts();
    refreshStats();
  }

  const severityColors = {
    critical: "bg-red-100 text-red-800 border-red-300",
    high: "bg-orange-100 text-orange-800 border-orange-300",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
    low: "bg-blue-100 text-blue-800 border-blue-300",
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-sm text-gray-500 mt-1">All anomalies detected across your fields</p>
        </div>
        {alerts?.length > 0 && (
          <button
            onClick={handleAckAll}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
          >
            Acknowledge All Visible
          </button>
        )}
      </div>

      {/* Stats row */}
      {stats && (
        <div className="flex gap-3 flex-wrap">
          {["critical", "high", "medium", "low"].map((s) => (
            <div
              key={s}
              className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold ${
                severityColors[s] ?? ""
              }`}
            >
              <span>{s}</span>
              <span className="font-bold">{stats.by_severity?.[s] ?? 0}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-300 text-sm text-gray-600">
            <span>Total</span>
            <span className="font-bold">{stats.total}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-300 text-sm text-gray-600">
            <span>Unacknowledged</span>
            <span className="font-bold text-red-600">{stats.unacknowledged}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <select
          value={fieldFilter}
          onChange={(e) => setFieldFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
        >
          <option value="">All Fields</option>
          {fields?.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All Severities"}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showAcknowledged}
            onChange={(e) => setShowAcknowledged(e.target.checked)}
            className="rounded border-gray-300 text-green-600"
          />
          Show acknowledged
        </label>
        <span className="text-xs text-gray-400 ml-auto">
          {alerts?.length ?? 0} alerts shown
        </span>
      </div>

      {/* Alert table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {!alerts || alerts.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-400 text-sm">
            No alerts match your filters
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                <th className="px-6 py-3 text-left">Severity</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Field</th>
                <th className="px-4 py-3 text-left">Message</th>
                <th className="px-4 py-3 text-left">Triggered</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {alerts.map((a) => (
                <>
                  <tr
                    key={a.id}
                    className={`hover:bg-gray-50 cursor-pointer ${a.acknowledged ? "opacity-50" : ""}`}
                    onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                  >
                    <td className="px-6 py-3">
                      <SeverityChip severity={a.severity} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <AlertTypeIcon type={a.alert_type} />
                        <span className="text-xs text-gray-600">{a.alert_type.replace(/_/g, " ")}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/fields/${a.field_id}`);
                        }}
                        className="text-green-700 hover:underline font-medium"
                      >
                        {a.field_name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{a.message}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(a.triggered_at + "Z"), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.acknowledged ? (
                        <span className="text-xs text-gray-400">Done</span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAck(a.id);
                          }}
                          className="text-xs text-green-700 hover:underline font-medium"
                        >
                          Acknowledge
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === a.id && (
                    <tr key={`${a.id}-exp`} className="bg-gray-50">
                      <td colSpan={6} className="px-6 py-4 text-sm text-gray-700">
                        <strong>Full message:</strong> {a.message}
                        {a.acknowledged_at && (
                          <span className="ml-4 text-xs text-gray-400">
                            Acknowledged {formatDistanceToNow(new Date(a.acknowledged_at + "Z"), { addSuffix: true })}
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
