import { useLang } from "../context/LangContext";

const styles = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-blue-100 text-blue-800 border-blue-300",
};

export default function SeverityChip({ severity }) {
  const { t } = useLang();
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
        styles[severity] ?? "bg-gray-100 text-gray-700 border-gray-300"
      }`}
    >
      {t(`severity_${severity}`, {}) || severity}
    </span>
  );
}
