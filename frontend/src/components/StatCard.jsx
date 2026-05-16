export default function StatCard({ title, value, subtitle, color = "green", icon }) {
  const colors = {
    green: "bg-green-50 border-green-200 text-green-700",
    red: "bg-red-50 border-red-200 text-red-700",
    yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    gray: "bg-gray-50 border-gray-200 text-gray-700",
  };
  return (
    <div className={`rounded-xl border-2 p-5 ${colors[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{title}</p>
          <p className="mt-1 text-3xl font-bold">{value ?? "—"}</p>
          {subtitle && <p className="mt-1 text-xs opacity-60">{subtitle}</p>}
        </div>
        {icon && <span className="text-3xl opacity-70">{icon}</span>}
      </div>
    </div>
  );
}
