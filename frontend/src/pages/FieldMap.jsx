import { useCallback } from "react";
import { MapContainer, GeoJSON, TileLayer, Popup } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import { getFields } from "../api/client";
import HealthBadge from "../components/HealthBadge";
import { usePolling } from "../hooks/usePolling";

function ndviToColor(ndvi) {
  if (ndvi == null) return "#9ca3af";
  if (ndvi >= 0.6) return "#16a34a";
  if (ndvi >= 0.45) return "#65a30d";
  if (ndvi >= 0.30) return "#f59e0b";
  return "#ef4444";
}

export default function FieldMap() {
  const navigate = useNavigate();
  const fetch = useCallback(() => getFields(), []);
  const { data: fields } = usePolling(fetch, 60000);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Field Map</h1>
        <p className="text-sm text-gray-500 mt-1">
          Fields colored by current NDVI — green (healthy) to red (critical)
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-600">
        {[
          { color: "#16a34a", label: "Healthy (≥0.6)" },
          { color: "#65a30d", label: "Good (0.45–0.6)" },
          { color: "#f59e0b", label: "Stressed (0.3–0.45)" },
          { color: "#ef4444", label: "Critical (<0.3)" },
          { color: "#9ca3af", label: "No data" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-sm border border-white shadow"
              style={{ background: color }}
            />
            {label}
          </div>
        ))}
      </div>

      <div className="h-[600px] rounded-xl overflow-hidden shadow-sm border border-gray-200">
        <MapContainer
          center={[51.515, -0.105]}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {fields?.map((field) => {
            let geoData;
            try {
              geoData = JSON.parse(field.geojson);
            } catch {
              return null;
            }
            const color = ndviToColor(field.latest_ndvi);
            return (
              <GeoJSON
                key={field.id}
                data={geoData}
                style={{
                  color: "#fff",
                  weight: 2,
                  fillColor: color,
                  fillOpacity: 0.65,
                }}
              >
                <Popup>
                  <div className="text-sm space-y-1 min-w-[180px]">
                    <p className="font-semibold text-base">{field.name}</p>
                    <p className="text-gray-500 capitalize">{field.crop_type} · {field.area_ha} ha</p>
                    <div className="flex items-center gap-2 mt-1">
                      <HealthBadge status={field.health_status} />
                      {field.active_alert_count > 0 && (
                        <span className="text-red-600 text-xs font-medium">
                          {field.active_alert_count} alert{field.active_alert_count !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <table className="w-full text-xs text-gray-600 mt-2">
                      <tbody>
                        <tr>
                          <td className="pr-2 font-medium">NDVI</td>
                          <td>{field.latest_ndvi?.toFixed(3) ?? "—"}</td>
                        </tr>
                        <tr>
                          <td className="pr-2 font-medium">Moisture</td>
                          <td>{field.latest_soil_moisture?.toFixed(1) ?? "—"}%</td>
                        </tr>
                        <tr>
                          <td className="pr-2 font-medium">Temp</td>
                          <td>{field.latest_temp_c?.toFixed(1) ?? "—"}°C</td>
                        </tr>
                      </tbody>
                    </table>
                    <button
                      onClick={() => navigate(`/fields/${field.id}`)}
                      className="mt-2 w-full text-center text-xs text-green-700 hover:underline font-medium"
                    >
                      View details →
                    </button>
                  </div>
                </Popup>
              </GeoJSON>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
