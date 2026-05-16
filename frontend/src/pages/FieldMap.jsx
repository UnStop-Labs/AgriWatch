import { useCallback, useState } from "react";
import { MapContainer, GeoJSON, TileLayer, Popup, useMap } from "react-leaflet";
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

// Thai farm locations for fly-to buttons
const FIELD_CENTERS = {
  "Chiang Rai Rice Paddy":        [19.921, 99.832],
  "Chiang Mai Corn Field":        [18.791, 98.970],
  "Suphan Buri Soybean Plot":     [14.471, 100.131],
  "Nakhon Pathom Vegetable Farm": [13.823, 100.062],
};

function FlyTo({ target }) {
  const map = useMap();
  if (target) map.flyTo(target, 14, { duration: 1.5 });
  return null;
}

export default function FieldMap() {
  const navigate = useNavigate();
  const [satellite, setSatellite] = useState(true);
  const [flyTarget, setFlyTarget] = useState(null);
  const fetch = useCallback(() => getFields(), []);
  const { data: fields } = usePolling(fetch, 60000);

  // Default center: geographic midpoint of all 4 Thai fields
  const CENTER = [16.5, 99.7];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Field Map</h1>
          <p className="text-sm text-gray-500 mt-1">
            Thailand demo farms — click any field polygon to inspect
          </p>
        </div>
        {/* Layer toggle */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1">
          <button
            onClick={() => setSatellite(true)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${satellite ? "bg-green-700 text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            🛰 Satellite
          </button>
          <button
            onClick={() => setSatellite(false)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!satellite ? "bg-green-700 text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            🗺 Street
          </button>
        </div>
      </div>

      {/* Field quick-nav */}
      <div className="flex gap-2 flex-wrap mb-4">
        {fields?.map((f) => (
          <button
            key={f.id}
            onClick={() => setFlyTarget(FIELD_CENTERS[f.name] || null)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors"
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: ndviToColor(f.latest_ndvi) }}
            />
            {f.name}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-600">
        {[
          { color: "#16a34a", label: "Healthy (≥0.6)" },
          { color: "#65a30d", label: "Good (0.45–0.6)" },
          { color: "#f59e0b", label: "Stressed (0.3–0.45)" },
          { color: "#ef4444", label: "Critical (<0.3)" },
          { color: "#9ca3af", label: "No data" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm border border-white shadow" style={{ background: color }} />
            {label}
          </div>
        ))}
      </div>

      <div className="h-[620px] rounded-xl overflow-hidden shadow-sm border border-gray-200">
        <MapContainer
          center={CENTER}
          zoom={7}
          style={{ height: "100%", width: "100%" }}
        >
          <FlyTo target={flyTarget} />

          {/* Satellite layer (Esri World Imagery) */}
          {satellite ? (
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics'
              maxZoom={19}
            />
          ) : (
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
          )}
          {fields?.map((field) => {
            let geoData;
            try { geoData = JSON.parse(field.geojson); } catch { return null; }
            const color = ndviToColor(field.latest_ndvi);
            return (
              <GeoJSON
                key={field.id}
                data={geoData}
                style={{ color: "#fff", weight: 2.5, fillColor: color, fillOpacity: 0.55 }}
                onEachFeature={(_, layer) => {
                  layer.on("mouseover", () => layer.setStyle({ fillOpacity: 0.8, weight: 3 }));
                  layer.on("mouseout", () => layer.setStyle({ fillOpacity: 0.55, weight: 2.5 }));
                }}
              >
                <Popup maxWidth={240}>
                  <div className="text-sm space-y-2 min-w-[200px]">
                    <div>
                      <p className="font-bold text-base text-gray-900">{field.name}</p>
                      <p className="text-gray-500 text-xs capitalize">{field.crop_type} · {field.area_ha} ha</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <HealthBadge status={field.health_status} />
                      {field.active_alert_count > 0 && (
                        <span className="text-red-600 text-xs font-semibold">
                          ⚠ {field.active_alert_count} alert{field.active_alert_count !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <table className="w-full text-xs text-gray-700 border-t pt-2">
                      <tbody>
                        <tr><td className="pr-3 font-medium py-0.5">NDVI</td><td>{field.latest_ndvi?.toFixed(3) ?? "—"}</td></tr>
                        <tr><td className="pr-3 font-medium py-0.5">Soil Moisture</td><td>{field.latest_soil_moisture?.toFixed(1) ?? "—"}%</td></tr>
                        <tr><td className="pr-3 font-medium py-0.5">Surface Temp</td><td>{field.latest_temp_c?.toFixed(1) ?? "—"}°C</td></tr>
                      </tbody>
                    </table>
                    <button
                      onClick={() => navigate(`/fields/${field.id}`)}
                      className="w-full mt-1 py-1.5 bg-green-700 text-white text-xs font-semibold rounded-md hover:bg-green-800 transition-colors"
                    >
                      Open Field Intelligence →
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
