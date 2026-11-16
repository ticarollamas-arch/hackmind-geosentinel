/**
 * Deterministic anomaly detection for NASA POWER daily time series.
 * Uses a rolling median/MAD robust score. No generative AI or opaque model.
 */
export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function detectAnomalies(points, options = {}) {
  const windowSize = Math.max(7, options.windowSize ?? 21);
  const threshold = options.threshold ?? 3.5;
  const values = points.map((p) => Number(p.value)).filter(Number.isFinite);
  return points.map((point, index) => {
    const start = Math.max(0, index - Math.floor(windowSize / 2));
    const end = Math.min(points.length, index + Math.ceil(windowSize / 2));
    const baseline = values.slice(start, end).filter((_, i) => start + i !== index);
    const center = median(baseline);
    const mad = median(baseline.map((v) => Math.abs(v - center)));
    const scale = 1.4826 * (mad || 0);
    const deviation = Number(point.value) - center;
    const score = scale > 0 ? deviation / scale : (deviation === 0 ? 0 : Math.sign(deviation) * (threshold + 1));
    return { ...point, baseline: Number(center.toFixed(3)), score: Number(score.toFixed(2)), anomaly: Math.abs(score) >= threshold };
  });
}

export function summarizeAnomalies(points) {
  const anomalies = points.filter((p) => p.anomaly);
  return {
    total: points.length,
    anomalies: anomalies.length,
    latest: anomalies.at(-1) ?? null,
    percentage: points.length ? Number((100 * anomalies.length / points.length).toFixed(1)) : 0
  };
}
