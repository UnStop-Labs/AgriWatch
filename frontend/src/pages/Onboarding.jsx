import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createField, seedField } from "../api/client";

const CROP_TYPES = ["wheat", "corn", "soy", "rice", "vegetables"];
const IRRIGATION_METHODS = [
  { value: "drip", label: "Drip Irrigation", desc: "Most efficient — 90%+ efficiency" },
  { value: "sprinkler", label: "Sprinkler", desc: "Good for large areas — 75–85% efficiency" },
  { value: "flood", label: "Flood / Surface", desc: "Traditional method — 40–60% efficiency" },
  { value: "none", label: "Rain-fed", desc: "No artificial irrigation" },
];

const STEPS = [
  { id: 1, label: "Field Info", icon: "📍" },
  { id: 2, label: "Crop Setup", icon: "🌱" },
  { id: 3, label: "Irrigation", icon: "💧" },
  { id: 4, label: "Baseline", icon: "📊" },
];

const DEFAULT_GEOJSON = JSON.stringify({
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [[
      [0.0, 0.0], [0.01, 0.0], [0.01, 0.01], [0.0, 0.01], [0.0, 0.0],
    ]],
  },
});

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold border-2 transition-all ${
                s.id < current
                  ? "bg-green-600 border-green-600 text-white"
                  : s.id === current
                  ? "border-green-600 text-green-600 bg-white"
                  : "border-gray-200 text-gray-300 bg-white"
              }`}
            >
              {s.id < current ? "✓" : s.icon}
            </div>
            <span
              className={`text-xs mt-1 font-medium ${
                s.id === current ? "text-green-600" : "text-gray-400"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`w-16 h-0.5 mx-1 mb-5 transition-all ${
                s.id < current ? "bg-green-600" : "bg-gray-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function Label({ children, hint }) {
  return (
    <div className="mb-1.5">
      <label className="block text-sm font-medium text-gray-700">{children}</label>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function Input({ ...props }) {
  return (
    <input
      {...props}
      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
    />
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    name: "",
    area_ha: "",
    // step 2
    crop_type: "",
    planting_date: "",
    // step 3
    irrigation_method: "",
    water_cost_per_m3: "",
    // step 4
    baseline_water_m3_ha: "",
    baseline_fertilizer_kg_ha: "",
    baseline_spray_usd_ha: "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const canNext = {
    1: form.name.trim() && Number(form.area_ha) > 0,
    2: form.crop_type && form.planting_date,
    3: form.irrigation_method,
    4: true,
  }[step];

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name.trim(),
        area_ha: Number(form.area_ha),
        crop_type: form.crop_type,
        geojson: DEFAULT_GEOJSON,
        planting_date: form.planting_date ? new Date(form.planting_date).toISOString() : null,
        irrigation_method: form.irrigation_method || null,
        water_cost_per_m3: form.water_cost_per_m3 ? Number(form.water_cost_per_m3) : null,
        baseline_water_m3_ha: form.baseline_water_m3_ha ? Number(form.baseline_water_m3_ha) : null,
        baseline_fertilizer_kg_ha: form.baseline_fertilizer_kg_ha
          ? Number(form.baseline_fertilizer_kg_ha)
          : null,
        baseline_spray_usd_ha: form.baseline_spray_usd_ha
          ? Number(form.baseline_spray_usd_ha)
          : null,
      };
      const field = await createField(body);
      await seedField(field.id, 30);
      navigate(`/fields/${field.id}`);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-start justify-center pt-12 px-4 pb-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <span className="text-4xl">🌾</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Add a New Field</h1>
          <p className="text-sm text-gray-500 mt-1">
            Takes 2 minutes · Generates instant ROI analysis
          </p>
        </div>

        <StepIndicator current={step} />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {/* Step 1 — Field Info */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Field Information</h2>
                <p className="text-sm text-gray-500 mt-1">Basic details to identify and size your field.</p>
              </div>
              <div>
                <Label>Field Name</Label>
                <Input
                  placeholder="e.g. North Wheat Block"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
              <div>
                <Label hint="Used to calculate total yield, water usage, and ROI">
                  Field Size (hectares)
                </Label>
                <Input
                  type="number"
                  min="0.1"
                  step="0.1"
                  placeholder="e.g. 45.5"
                  value={form.area_ha}
                  onChange={(e) => set("area_ha", e.target.value)}
                />
                {form.area_ha && (
                  <p className="text-xs text-gray-400 mt-1">
                    ≈ {(Number(form.area_ha) * 2.47).toFixed(1)} acres
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2 — Crop Setup */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Crop Setup</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Used to forecast yield, calculate harvest timing, and set NDVI benchmarks.
                </p>
              </div>
              <div>
                <Label>Crop Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {CROP_TYPES.map((c) => (
                    <button
                      key={c}
                      onClick={() => set("crop_type", c)}
                      className={`py-2.5 rounded-lg text-sm font-medium capitalize border transition-all ${
                        form.crop_type === c
                          ? "bg-green-600 text-white border-green-600"
                          : "border-gray-200 text-gray-600 hover:border-green-400"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label hint="Used to calculate days to harvest and flag overdue fields">
                  Planting Date
                </Label>
                <Input
                  type="date"
                  value={form.planting_date}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) => set("planting_date", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 3 — Irrigation */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Irrigation Setup</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Used to calculate water savings and cost impact of optimization.
                </p>
              </div>
              <div>
                <Label>Irrigation Method</Label>
                <div className="space-y-2">
                  {IRRIGATION_METHODS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => set("irrigation_method", m.value)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                        form.irrigation_method === m.value
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-green-300"
                      }`}
                    >
                      <span className="text-sm font-medium text-gray-900">{m.label}</span>
                      <span className="text-xs text-gray-400 ml-2">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label hint="Optional — improves water savings dollar calculation">
                  Water Cost (USD per m³) <span className="text-gray-400 font-normal">optional</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 0.45"
                  value={form.water_cost_per_m3}
                  onChange={(e) => set("water_cost_per_m3", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 4 — Baseline */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Current Baseline Usage</h2>
                <p className="text-sm text-gray-500 mt-1">
                  All optional — but the more you provide, the more accurate your ROI calculations.
                </p>
              </div>
              <div>
                <Label hint="Your typical seasonal water use before optimization">
                  Water Usage (m³ / ha / season) <span className="text-gray-400 font-normal">optional</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 4500"
                  value={form.baseline_water_m3_ha}
                  onChange={(e) => set("baseline_water_m3_ha", e.target.value)}
                />
              </div>
              <div>
                <Label hint="NPK and other fertilizers combined">
                  Fertilizer Usage (kg / ha / season) <span className="text-gray-400 font-normal">optional</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 200"
                  value={form.baseline_fertilizer_kg_ha}
                  onChange={(e) => set("baseline_fertilizer_kg_ha", e.target.value)}
                />
              </div>
              <div>
                <Label hint="Herbicides, pesticides, fungicides total cost">
                  Spraying Cost (USD / ha / season) <span className="text-gray-400 font-normal">optional</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 150"
                  value={form.baseline_spray_usd_ha}
                  onChange={(e) => set("baseline_spray_usd_ha", e.target.value)}
                />
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
            <button
              onClick={() => (step === 1 ? navigate("/") : setStep((s) => s - 1))}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              ← {step === 1 ? "Cancel" : "Back"}
            </button>
            {step < 4 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext}
                className="px-6 py-2.5 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={saving}
                className="px-6 py-2.5 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50 transition-colors"
              >
                {saving ? "Creating field…" : "🚀 Launch Intelligence"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
