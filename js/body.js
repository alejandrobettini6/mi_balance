export const BMI_MIN = 15;
export const BMI_MAX = 40;
export const WHTR_MIN = 0.32;
export const WHTR_MAX = 0.75;

export function parseDecimal(raw) {
  if (raw == null) return null;
  const text = String(raw).trim().replace(",", ".");
  if (!text) return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function sanitizeDecimal(raw, maxDecimals = 1) {
  let text = String(raw ?? "").replace(/[^\d.,]/g, "");
  const sep = text.search(/[.,]/);
  if (sep === -1) return text;
  const head = text.slice(0, sep);
  const mark = text[sep] === "," ? "," : ".";
  const tail = text.slice(sep + 1).replace(/[.,]/g, "").slice(0, maxDecimals);
  return `${head}${mark}${tail}`;
}

export function formatDecimal(value, digits) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

export function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

export function bmi(weightKg, heightCm) {
  if (weightKg == null || heightCm == null || heightCm <= 0) return null;
  const meters = heightCm / 100;
  return weightKg / (meters * meters);
}

export function waistHeightRatio(waistCm, heightCm) {
  if (waistCm == null || heightCm == null || heightCm <= 0) return null;
  return waistCm / heightCm;
}

export function markerPosition(value, min, max) {
  if (value == null || max === min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function bmiZone(value) {
  if (value == null) return null;
  if (value < 18.5) {
    return { id: "under", label: "Bajo peso", hint: "" };
  }
  if (value < 25) {
    return { id: "normal", label: "Normal", hint: "" };
  }
  if (value < 30) {
    const barely = value <= 27;
    return {
      id: "over",
      label: "Sobrepeso",
      hint: barely ? "Apenas en sobrepeso, cerca del rango normal." : "",
    };
  }
  return { id: "obese", label: "Obesidad", hint: "" };
}

export function whtrZone(value) {
  if (value == null) return null;
  if (value < 0.4) return { id: "low", label: "Baja", hint: "" };
  if (value < 0.5) return { id: "healthy", label: "Saludable", hint: "" };
  if (value < 0.6) return { id: "raised", label: "Aumentada", hint: "" };
  return { id: "high", label: "Alta", hint: "" };
}

function stop(value, min, max) {
  return ((value - min) / (max - min)) * 100;
}

export function bmiGradient() {
  const at = (value) => stop(value, BMI_MIN, BMI_MAX);
  return `linear-gradient(90deg, #6d7c8a 0%, #8ea0ae ${at(18.5)}%, #2f9e72 ${at(21.5)}%, #1f8a62 ${at(24.5)}%, #e0a106 ${at(27)}%, #d06a2b ${at(30)}%, #c63b2f ${at(35)}%, #c63b2f 100%)`;
}

export function whtrGradient() {
  const at = (value) => stop(value, WHTR_MIN, WHTR_MAX);
  return `linear-gradient(90deg, #6d7c8a 0%, #8ea0ae ${at(0.4)}%, #2f9e72 ${at(0.45)}%, #1f8a62 ${at(0.49)}%, #e0a106 ${at(0.53)}%, #d06a2b ${at(0.6)}%, #c63b2f ${at(0.68)}%, #c63b2f 100%)`;
}

export function latestWeight(entries) {
  const rows = entries.filter((entry) => entry.weight_kg != null);
  if (!rows.length) return null;
  return Number(rows.sort((a, b) => a.entry_date.localeCompare(b.entry_date)).at(-1).weight_kg);
}

export function latestWaist(entries) {
  const rows = entries.filter((entry) => entry.waist_cm != null);
  if (!rows.length) return null;
  return Number(rows.sort((a, b) => a.entry_date.localeCompare(b.entry_date)).at(-1).waist_cm);
}
