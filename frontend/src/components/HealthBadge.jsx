const cfg = {
  healthy: { cls: "bg-green-100 text-green-800", label: "Healthy" },
  watch: { cls: "bg-blue-100 text-blue-800", label: "Watch" },
  warning: { cls: "bg-yellow-100 text-yellow-800", label: "Warning" },
  critical: { cls: "bg-red-100 text-red-800", label: "Critical" },
  unknown: { cls: "bg-gray-100 text-gray-600", label: "Unknown" },
};

export default function HealthBadge({ status }) {
  const { cls, label } = cfg[status] ?? cfg.unknown;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}
