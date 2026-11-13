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

export function kgFromIdeal(weightKg, heightCm) {
  if (weightKg == null || heightCm == null || heightCm <= 0) return null;
  const meters = heightCm / 100;
  const at = (index) => index * meters * meters;
  const low = at(18.5);
  const high = at(24.9);
  if (weightKg < low) return roundTo(weightKg - low, 1);
  if (weightKg > high) return roundTo(weightKg - high, 1);
  return 0;
}

export function idealMessage(zone, weightKg, heightCm) {
  if (!zone) return "";
  const gap = kgFromIdeal(weightKg, heightCm);
  if (zone.id === "normal" || gap === 0) return "Estás en tu rango ideal.";
  const kilos = gap == null ? null : Math.round(Math.abs(gap));
  const distance = gap == null
    ? ""
    : kilos === 0
      ? (gap > 0 ? "a menos de 1 kg de tu ideal" : "a menos de 1 kg por debajo de tu ideal")
      : gap > 0
        ? `a unos ${kilos} kg de tu ideal`
        : `a unos ${kilos} kg por debajo de tu ideal`;
  const lead = zone.id === "over" && zone.hint ? "Apenas en sobrepeso" : zone.label;
  return distance ? `${lead}, ${distance}.` : `${lead}.`;
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
  return `linear-gradient(90deg, #5b6d7d 0%, #7f93a3 ${at(18.5)}%, #3ecf8e ${at(20)}%, #149a62 ${at(22.5)}%, #178a52 ${at(24.5)}%, #f0b429 ${at(26)}%, #f08a24 ${at(28.5)}%, #e15a32 ${at(30)}%, #d23b3b ${at(34)}%, #b4232c 100%)`;
}

export function whtrGradient() {
  const at = (value) => stop(value, WHTR_MIN, WHTR_MAX);
  return `linear-gradient(90deg, #5b6d7d 0%, #7f93a3 ${at(0.4)}%, #3ecf8e ${at(0.43)}%, #149a62 ${at(0.47)}%, #178a52 ${at(0.49)}%, #f0b429 ${at(0.53)}%, #f08a24 ${at(0.57)}%, #e15a32 ${at(0.6)}%, #d23b3b ${at(0.68)}%, #b4232c 100%)`;
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
