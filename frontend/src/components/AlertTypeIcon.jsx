const icons = {
  ndvi_low: "🍂",
  ndvi_rapid_decline: "📉",
  soil_dry: "🏜️",
  soil_waterlogged: "💧",
  heat_stress: "🔥",
  cold_stress: "❄️",
  anomaly_cluster: "⚠️",
};

export default function AlertTypeIcon({ type }) {
  return <span title={type}>{icons[type] ?? "🔔"}</span>;
}
