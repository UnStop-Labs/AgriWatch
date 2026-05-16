import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createField, deleteField, getFields, seedField } from "../api/client";
import HealthBadge from "../components/HealthBadge";
import { usePolling } from "../hooks/usePolling";

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
    if (!confirm("Delete this field and all its data?")) return;
    await deleteField(id);
    refresh();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fields</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your monitored farm fields</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800"
        >
          + Add Field
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 shadow-sm"
        >
          <h2 className="font-semibold text-gray-800">New Field</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Field Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                placeholder="North Wheat Block"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Crop Type</label>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Area (ha)</label>
              <input
                required
                type="number"
                min="0.1"
                step="0.1"
                value={form.area_ha}
                onChange={(e) => setForm({ ...form, area_ha: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                placeholder="45.0"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Create Field"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              Cancel
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
                { label: "Moisture", value: f.latest_soil_moisture != null ? `${f.latest_soil_moisture.toFixed(0)}%` : "—" },
                { label: "Temp", value: f.latest_temp_c != null ? `${f.latest_temp_c.toFixed(1)}°C` : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg py-2">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="text-sm font-semibold text-gray-800">{value}</div>
                </div>
              ))}
            </div>
            {f.active_alert_count > 0 && (
              <p className="text-xs text-red-600 font-medium mb-3">
                ⚠ {f.active_alert_count} active alert{f.active_alert_count !== 1 ? "s" : ""}
              </p>
            )}
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => handleSeed(f.id)}
                disabled={seeding === f.id}
                className="flex-1 text-xs py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {seeding === f.id ? "Seeding…" : "Re-seed Data"}
              </button>
              <button
                onClick={(e) => handleDelete(e, f.id)}
                className="px-3 text-xs py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
