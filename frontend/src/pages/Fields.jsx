import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createField, deleteField, getFields, seedField } from "../api/client";
import HealthBadge from "../components/HealthBadge";
import { usePolling } from "../hooks/usePolling";
import { useLang } from "../context/LangContext";

const CROP_TYPES = ["wheat", "corn", "soy", "rice", "vegetables"];

const DEFAULT_GEOJSON = JSON.stringify({
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-0.12, 51.52],
        [-0.10, 51.52],
        [-0.10, 51.53],
        [-0.12, 51.53],
        [-0.12, 51.52],
      ],
    ],
  },
});

export default function Fields() {
  const navigate = useNavigate();
  const { t } = useLang();
  const fetch = useCallback(() => getFields(), []);
  const { data: fields, refresh } = usePolling(fetch, 60000);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    crop_type: "wheat",
    area_ha: "",
    geojson: DEFAULT_GEOJSON,
  });
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await createField({ ...form, area_ha: parseFloat(form.area_ha) });
      setShowForm(false);
      setForm({ name: "", crop_type: "wheat", area_ha: "", geojson: DEFAULT_GEOJSON });
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleSeed(fieldId) {
    setSeeding(fieldId);
    try {
      await seedField(fieldId, 30);
      refresh();
    } finally {
      setSeeding(null);
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm(t("fields_confirm_delete"))) return;
    await deleteField(id);
    refresh();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("fields_title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("fields_subtitle")}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800"
        >
          {t("fields_add")}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 shadow-sm"
        >
          <h2 className="font-semibold text-gray-800">{t("fields_new_field")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("fields_field_name")}</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                placeholder={t("fields_field_name_placeholder")}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("fields_crop_type")}</label>
              <select
                value={form.crop_type}
                onChange={(e) => setForm({ ...form, crop_type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
              >
                {CROP_TYPES.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("fields_area_ha")}</label>
              <input
                required
                type="number"
                min="0.1"
                step="0.1"
                value={form.area_ha}
                onChange={(e) => setForm({ ...form, area_ha: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                placeholder={t("fields_area_placeholder")}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50"
            >
              {saving ? t("fields_saving") : t("fields_create")}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              {t("fields_cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {fields?.map((f) => (
          <div
            key={f.id}
            className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate(`/fields/${f.id}`)}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">{f.name}</h3>
                <p className="text-xs text-gray-500 capitalize mt-0.5">{f.crop_type} · {f.area_ha} ha</p>
              </div>
              <HealthBadge status={f.health_status} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center mb-4">
              {[
                { label: "NDVI", value: f.latest_ndvi?.toFixed(3) ?? "—" },
                { label: t("fields_moisture"), value: f.latest_soil_moisture != null ? `${f.latest_soil_moisture.toFixed(0)}%` : "—" },
                { label: t("fields_temp"), value: f.latest_temp_c != null ? `${f.latest_temp_c.toFixed(1)}°C` : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg py-2">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="text-sm font-semibold text-gray-800">{value}</div>
                </div>
              ))}
            </div>
            {f.active_alert_count > 0 && (
              <p className="text-xs text-red-600 font-medium mb-3">
                ⚠ {f.active_alert_count} {f.active_alert_count !== 1 ? t("fields_active_alerts") : t("fields_active_alert")}
              </p>
            )}
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => handleSeed(f.id)}
                disabled={seeding === f.id}
                className="flex-1 text-xs py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {seeding === f.id ? t("fields_seeding") : t("fields_reseed")}
              </button>
              <button
                onClick={(e) => handleDelete(e, f.id)}
                className="px-3 text-xs py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
              >
                {t("fields_delete")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
