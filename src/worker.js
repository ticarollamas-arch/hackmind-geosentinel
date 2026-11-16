import { detectAnomalies } from "./anomaly.js";

self.onmessage = (event) => {
  const { id, points, options } = event.data;
  try {
    const result = detectAnomalies(points, options);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || "Falha no processamento" });
  }
};
