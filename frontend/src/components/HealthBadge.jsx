import { useLang } from "../context/LangContext";

const cfg = {
  healthy: { cls: "bg-green-100 text-green-800", key: "health_healthy" },
  watch: { cls: "bg-blue-100 text-blue-800", key: "health_watch" },
  warning: { cls: "bg-yellow-100 text-yellow-800", key: "health_warning" },
  critical: { cls: "bg-red-100 text-red-800", key: "health_critical" },
  unknown: { cls: "bg-gray-100 text-gray-600", key: "health_unknown" },
};

export default function HealthBadge({ status }) {
  const { t } = useLang();
  const { cls, key } = cfg[status] ?? cfg.unknown;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {t(key)}
    </span>
  );
}
