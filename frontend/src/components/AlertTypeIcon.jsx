import { useLang } from "../context/LangContext";

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
  const { t } = useLang();
  const label = t(`alert_type_${type}`, {}) || type;
  return <span title={label}>{icons[type] ?? "🔔"}</span>;
}
