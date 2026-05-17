import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000" });

const normalize = (err) => {
  const msg = err.response?.data?.detail || err.message || "Request failed";
  throw Object.assign(new Error(msg), { status: err.response?.status });
};

export const getFields = () => api.get("/api/fields").then((r) => r.data).catch(normalize);
export const createField = (body) => api.post("/api/fields", body).then((r) => r.data).catch(normalize);
export const getField = (id) => api.get(`/api/fields/${id}`).then((r) => r.data).catch(normalize);
export const updateField = (id, body) => api.put(`/api/fields/${id}`, body).then((r) => r.data).catch(normalize);
export const deleteField = (id) => api.delete(`/api/fields/${id}`).catch(normalize);
export const seedField = (id, days = 30) =>
  api.post(`/api/fields/${id}/seed?days=${days}`).then((r) => r.data).catch(normalize);

export const getReadings = (fieldId, from, to, limit = 500) => {
  const params = { limit };
  if (from) params.from = from;
  if (to) params.to = to;
  return api.get(`/api/readings/${fieldId}`, { params }).then((r) => r.data).catch(normalize);
};
export const getReadingsSummary = () => api.get("/api/readings/summary").then((r) => r.data).catch(normalize);
export const triggerIngest = () => api.get("/api/readings/ingest").then((r) => r.data).catch(normalize);

export const getAlerts = (filters = {}) =>
  api.get("/api/alerts", { params: filters }).then((r) => r.data).catch(normalize);
export const getAlertStats = () => api.get("/api/alerts/stats").then((r) => r.data).catch(normalize);
export const acknowledgeAlert = (id) =>
  api.patch(`/api/alerts/${id}/acknowledge`).then((r) => r.data).catch(normalize);
export const acknowledgeAll = (fieldId) => {
  const params = fieldId ? { field_id: fieldId } : {};
  return api.patch("/api/alerts/acknowledge-all", null, { params }).then((r) => r.data).catch(normalize);
};

export const getSystemHealth = () => api.get("/api/system/health").then((r) => r.data).catch(normalize);
export const getSystemConfig = () => api.get("/api/system/config").then((r) => r.data).catch(normalize);
export const updateSystemConfig = (body) =>
  api.put("/api/system/config", body).then((r) => r.data).catch(normalize);

export const getFieldIntelligence = (id) =>
  api.get(`/api/fields/${id}/intelligence`).then((r) => r.data).catch(normalize);
export const getDashboardFinancials = () =>
  api.get("/api/fields/intelligence/dashboard").then((r) => r.data).catch(normalize);

export const analyzeIrrigation = (lat, lng, area_ha = 10) =>
  api.get("/api/irrigation/analyze", { params: { lat, lng, area_ha } }).then((r) => r.data).catch(normalize);
