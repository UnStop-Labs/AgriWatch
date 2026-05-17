import { formatDistanceToNow } from "date-fns";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  acknowledgeAlert,
  getAlerts,
  getDashboardFinancials,
  getReadingsSummary,
  triggerIngest,
} from "../api/client";
import AlertTypeIcon from "../components/AlertTypeIcon";
import SeverityChip from "../components/SeverityChip";
import { usePolling } from "../hooks/usePolling";
import { useLang } from "../context/LangContext";

function fmt$(n) {
  if (n == null) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function HarvestBadge({ status, days }) {
  const { t } = useLang();
  if (status === "unknown") return null;
  const cfg = {
    overdue: { cls: "bg-red-100 text-red-700 border-red-200", label: t("harvest_overdue", { n: Math.abs(days) }) },
    imminent: { cls: "bg-orange-100 text-orange-700 border-orange-200", label: t("harvest_days", { n: days }) },
    upcoming: { cls: "bg-yellow-100 text-yellow-700 border-yellow-200", label: t("harvest_days", { n: days }) },
    on_track: { cls: "bg-green-100 text-green-700 border-green-200", label: t("harvest_days", { n: days }) },
  }[status] || { cls: "bg-gray-100 text-gray-500", label: "—" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.cls}`}>
      🌾 {cfg.label}
    </span>
  );
}

function FieldCard({ field, onClick }) {
  const { t } = useLang();
  const harvest = field.harvest_status;
  const isOverdue = harvest === "overdue";
  const borderClass = isOverdue
    ? "border-red-300 bg-red-50"
    : field.yield_vs_baseline_pct < -10
    ? "border-orange-200 bg-orange-50"
    : "border-gray-200 bg-white";

  const yieldColor =
    field.yield_vs_baseline_pct >= 0
      ? "text-green-600"
      : field.yield_vs_baseline_pct >= -15
      ? "text-yellow-600"
      : "text-red-600";

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-5 cursor-pointer hover:shadow-md transition-all ${borderClass}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{field.field_name}</h3>
          <p className="text-xs text-gray-500 capitalize mt-0.5">
            {field.crop_type} · {field.area_ha} ha
          </p>
        </div>
        {isOverdue && (
          <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">
            {t("dash_overdue")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-xs text-gray-400">{t("dash_yield_forecast")}</p>
          <p className="text-lg font-bold text-gray-900">{field.yield_forecast_tons}t</p>
          <p className={`text-xs font-medium ${yieldColor}`}>
            {field.yield_vs_baseline_pct >= 0 ? "+" : ""}
            {field.yield_vs_baseline_pct}% {t("dash_vs_baseline_pct")}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">{t("dash_est_savings")}</p>
          <p className="text-lg font-bold text-green-600">{fmt$(field.total_savings_usd)}</p>
          <p className="text-xs text-gray-400">{t("dash_season")}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <HarvestBadge status={field.harvest_status} days={field.days_to_harvest} />
        <span className="text-xs text-gray-400">NDVI {field.avg_ndvi_30d}</span>
      </div>
    </div>
  );
}

function FinancialKPI({ label, value, sub, icon, color }) {
  const colors = {
    green: "from-green-50 to-emerald-50 border-green-200",
    blue: "from-blue-50 to-sky-50 border-blue-200",
    amber: "from-amber-50 to-yellow-50 border-amber-200",
    purple: "from-purple-50 to-violet-50 border-purple-200",
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-5 ${colors[color] || colors.green}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [ingesting, setIngesting] = useState(false);

  const fetchFinancials = useCallback(() => getDashboardFinancials(), []);
  const fetchAlerts = useCallback(() => getAlerts({ acknowledged: false, limit: 8 }), []);
  const fetchSummary = useCallback(() => getReadingsSummary(), []);

  const { data: financials, refresh: refreshFinancials } = usePolling(fetchFinancials, 60000);
  const { data: alerts, refresh: refreshAlerts } = usePolling(fetchAlerts, 30000);
  const { data: summary } = usePolling(fetchSummary, 60000);

  const totalAlerts = alerts?.length ?? 0;
  const criticalFields = summary?.filter((f) => f.health_status === "critical").length ?? 0;
  const overdueFields = financials?.fields?.filter((f) => f.harvest_status === "overdue").length ?? 0;

  async function handleIngest() {
    setIngesting(true);
    try {
      await triggerIngest();
      refreshFinancials();
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

  // Top recommendations across all fields, sorted by financial impact
  const topRecs = financials?.fields
    ?.flatMap((f) =>
      (f.recommendations || []).slice(0, 2).map((r) => ({
        ...r,
        field_name: f.field_name,
        field_id: f.field_id,
      }))
    )
    .sort((a, b) => b.financial_impact_usd - a.financial_impact_usd)
    .slice(0, 4) ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("dash_title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("dash_subtitle")}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/onboarding")}
            className="px-4 py-2 border border-green-700 text-green-700 rounded-lg text-sm font-medium hover:bg-green-50 transition-colors"
          >
            {t("dash_add_field")}
          </button>
          <button
            onClick={handleIngest}
            disabled={ingesting}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50 transition-colors"
          >
            {ingesting ? t("dash_ingesting") : t("dash_refresh")}
          </button>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <FinancialKPI
          label={t("dash_yield")}
          value={financials ? `${financials.total_yield_forecast_tons}t` : "—"}
          sub={t("dash_across_fields", { n: financials?.fields?.length ?? 0 })}
          icon="🌾"
          color="green"
        />
        <FinancialKPI
          label={t("dash_water_savings")}
          value={fmt$(financials?.total_water_savings_usd)}
          sub={t("dash_vs_baseline")}
          icon="💧"
          color="blue"
        />
        <FinancialKPI
          label={t("dash_input_savings")}
          value={fmt$(
            (financials?.total_fertilizer_savings_usd ?? 0) +
              (financials?.total_spray_savings_usd ?? 0)
          )}
          sub={t("dash_fertilizer_spray")}
          icon="🧪"
          color="amber"
        />
        <FinancialKPI
          label={t("dash_roi")}
          value={fmt$(financials?.total_savings_usd)}
          sub={t("dash_this_season")}
          icon="📈"
          color="purple"
        />
      </div>

      {/* Status bar */}
      <div className="flex gap-4 flex-wrap">
        {[
          {
            label: t("dash_active_alerts"),
            value: totalAlerts,
            color: totalAlerts > 0 ? "text-red-600" : "text-green-600",
            icon: "🔔",
          },
          {
            label: t("dash_critical_fields"),
            value: criticalFields,
            color: criticalFields > 0 ? "text-red-600" : "text-green-600",
            icon: "⚠️",
          },
          {
            label: t("dash_overdue_harvest"),
            value: overdueFields,
            color: overdueFields > 0 ? "text-red-600" : "text-green-600",
            icon: "🚨",
          },
          {
            label: t("dash_fields_monitored"),
            value: financials?.fields?.length ?? "—",
            color: "text-gray-700",
            icon: "🗺️",
          },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2">
            <span>{icon}</span>
            <span className={`font-bold text-lg ${color}`}>{value}</span>
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {/* Field Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">{t("dash_field_intel")}</h2>
          <button onClick={() => navigate("/fields")} className="text-sm text-green-700 hover:underline">
            {t("dash_manage_fields")}
          </button>
        </div>
        {!financials?.fields?.length ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
            {t("dash_no_fields")}{" "}
            <button onClick={() => navigate("/onboarding")} className="text-green-700 hover:underline">
              {t("dash_add_first")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {financials.fields.map((f) => (
              <FieldCard
                key={f.field_id}
                field={f}
                onClick={() => navigate(`/fields/${f.field_id}`)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Recommendations */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-800">{t("dash_top_recs")}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{t("dash_by_impact")}</p>
            </div>
          </div>
          {topRecs.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">
              {t("dash_all_optimal")}
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {topRecs.map((r, i) => (
                <li
                  key={i}
                  className="px-6 py-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/fields/${r.field_id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            r.priority === "high"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {r.priority}
                        </span>
                        <span className="text-xs text-gray-400">{r.field_name}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900">{r.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.action}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-green-600">{fmt$(r.financial_impact_usd)}</p>
                      <p className="text-xs text-gray-400">{t("dash_impact")}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Alert Feed */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">{t("dash_active_alerts_title")}</h2>
            <button onClick={() => navigate("/alerts")} className="text-sm text-green-700 hover:underline">
              {t("dash_view_all")}
            </button>
          </div>
          {!alerts || alerts.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">
              {t("dash_no_alerts")}
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
                    {t("dash_dismiss")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
