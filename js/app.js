import {
  BMI_MAX,
  BMI_MIN,
  WHTR_MAX,
  WHTR_MIN,
  bmi,
  bmiGradient,
  bmiZone,
  formatDecimal,
  latestWaist,
  latestWeight,
  markerPosition,
  parseDecimal,
  roundTo,
  sanitizeDecimal,
  waistHeightRatio,
  whtrGradient,
  whtrZone,
} from "./body.js";
import { isConfigured } from "./config.js";
import { createMemoryRepository, createRepository } from "./db.js";
import {
  enableNotifications,
  reminderMessages,
  scheduleReminder,
  showReminder,
} from "./notifications.js";
import { mountWeekReview } from "./week-review.js";
import {
  WEEKDAY_OPTIONS,
  addDays,
  buildWeeks,
  direction,
  entryOn,
  formatDay,
  formatRange,
  nextEntries,
  todayISO,
  weekStart,
  weekToReview,
  weekday,
  weekdayLabel,
} from "./weeks.js";

const root = document.querySelector("#app");
const params = new URLSearchParams(window.location.search);
const previewMode = !isConfigured() && params.has("preview");
const previewKind = params.get("preview") || "onboarding";

const state = {
  screen: "loading",
  view: "hoy",
  user: null,
  profile: null,
  entries: [],
  selectedDate: todayISO(),
  message: "",
  supabase: null,
  repo: null,
  review: null,
  stopReminder: () => {},
  reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};

let loadId = 0;

function weeks() {
  return buildWeeks(state.entries, state.profile?.week_starts_on ?? 1);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function validate(kind, value) {
  if (value == null) return "Ingresá un número.";
  if (kind === "height" && (value < 100 || value > 250)) return "La altura tiene que estar entre 100 y 250 cm.";
  if (kind === "weight" && (value < 30 || value > 300)) return "El peso tiene que estar entre 30 y 300 kg.";
  if (kind === "waist" && (value < 40 || value > 200)) return "La cintura tiene que estar entre 40 y 200 cm.";
  return "";
}

function setFormError(text) {
  const error = document.querySelector("#form-error");
  if (error) error.textContent = text;
}

function scaleMarkup({ title, value, digits, zone, position, gradient, ticks, compact = false }) {
  return `
    <article class="scale ${compact ? "compact" : ""}">
      <div class="scale-top">
        <span>${title}</span>
        <strong>${value == null ? "—" : formatDecimal(value, digits)}</strong>
        <em class="zone ${zone?.id ?? ""}">${zone?.label ?? ""}</em>
      </div>
      <div class="scale-track" style="background:${gradient}">
        <span class="scale-marker" style="--p:${position}"></span>
      </div>
      <div class="scale-ticks">${ticks.map((tick) => `<span>${tick}</span>`).join("")}</div>
      ${zone?.hint ? `<p class="hint">${zone.hint}</p>` : ""}
    </article>
  `;
}

function fieldValue(value) {
  if (value == null || value === "") return "";
  const rounded = roundTo(value, 1);
  return formatDecimal(rounded, Number.isInteger(rounded) ? 0 : 1);
}

function profileScales(height, weight, waist, compact) {
  const bmiValue = bmi(weight, height);
  const ratio = waistHeightRatio(waist, height);
  const blocks = [];
  if (bmiValue != null) {
    blocks.push(scaleMarkup({
      title: "Índice de masa corporal",
      value: bmiValue,
      digits: 1,
      zone: bmiZone(bmiValue),
      position: markerPosition(bmiValue, BMI_MIN, BMI_MAX),
      gradient: bmiGradient(),
      ticks: ["Bajo peso", "Normal", "Sobrepeso", "Obesidad"],
      compact,
    }));
  }
  if (ratio != null) {
    blocks.push(scaleMarkup({
      title: "Relación cintura-altura",
      value: ratio,
      digits: 2,
      zone: whtrZone(ratio),
      position: markerPosition(ratio, WHTR_MIN, WHTR_MAX),
      gradient: whtrGradient(),
      ticks: ["Baja", "Saludable", "Aumentada", "Alta"],
      compact,
    }));
  }
  if (!blocks.length) return `<p class="meta">Completá los datos para ver en qué rango estás.</p>`;
  return blocks.join("");
}

function deltaChip(delta, unit, comparedTo, number) {
  const way = direction(delta);
  if (!way) return "";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const text = way === "same" ? "igual" : `${sign}${formatDecimal(Math.abs(delta), 1)} ${unit}`;
  const title = comparedTo && comparedTo !== number - 1
    ? `Respecto de la semana ${comparedTo}`
    : "Respecto de la semana anterior";
  return `<span class="chip ${way}" title="${title}">${text}</span>`;
}

function toast() {
  return state.message ? `<p class="toast">${esc(state.message)}</p>` : "";
}

function previewRibbon() {
  return previewMode ? `<p class="preview-ribbon">Vista previa, sin cuenta</p>` : "";
}

function loginHtml() {
  const setup = isConfigured()
    ? ""
    : `<div class="setup">
        <p>Para entrar con Google, completá la URL y la clave anónima en <code>js/config.js</code>. El SQL está en <code>supabase/schema.sql</code>.</p>
        <p><a href="?preview=1">Ver el formulario</a> · <a href="?preview=home">Ver una semana</a> · <a href="?preview=review">Ver el cierre</a></p>
      </div>`;
  return `
    <main class="gate">
      <p class="brand">Mi balance</p>
      <h1>Tu peso, semana a semana.</h1>
      <p class="lede">Registrá el peso del día. El promedio de la semana muestra si bajaste o subiste, sin la fluctuación de un día suelto.</p>
      <button type="button" class="btn google" id="google">
        <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.8-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/>
          <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z"/>
          <path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.4-.4-2.4s.1-1.7.4-2.4V6.5H1.4C.5 8.3 0 10.1 0 12s.5 3.7 1.4 5.5l4-3.1z"/>
          <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.1 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.5l4 3.1C6.3 6.8 8.9 4.8 12 4.8z"/>
        </svg>
        Continuar con Google
      </button>
      <p class="form-error" id="form-error">${esc(state.message)}</p>
      ${setup}
    </main>
  `;
}

function onboardingHtml() {
  return `
    <main class="screen">
      ${previewRibbon()}
      <p class="eyebrow">Para empezar</p>
      <h1>Tu punto de partida</h1>
      <p class="lede">Altura, peso y cintura a la altura del ombligo. Con eso se arma el perfil y después se va actualizando.</p>
      <form id="start-form">
        <label class="field">
          <span>Altura</span>
          <div class="measure">
            <input id="height" inputmode="decimal" autocomplete="off" enterkeyhint="next" maxlength="6" required>
            <span>cm</span>
          </div>
        </label>
        <label class="field">
          <span>Peso</span>
          <div class="measure">
            <input id="weight" inputmode="decimal" autocomplete="off" enterkeyhint="next" maxlength="6" required>
            <span>kg</span>
          </div>
        </label>
        <label class="field">
          <span>Cintura</span>
          <div class="measure">
            <input id="waist" inputmode="decimal" autocomplete="off" enterkeyhint="done" maxlength="6" required>
            <span>cm</span>
          </div>
        </label>
        <div id="scales">${profileScales(null, null, null, false)}</div>
        <p class="fine">Los rangos son una referencia para adultos. No reemplazan a un médico.</p>
        <p class="form-error" id="form-error"></p>
        <button type="submit" class="btn primary">Guardar y empezar</button>
      </form>
    </main>
  `;
}

function bannerHtml() {
  if (!state.profile) return "";
  const messages = reminderMessages(state.profile, state.entries, todayISO());
  if (!messages.length) return "";
  return `<div class="banner">${messages.map((message) => `<p>${message}</p>`).join("")}</div>`;
}

function hoyHtml() {
  const today = todayISO();
  const existing = entryOn(state.entries, state.selectedDate);
  const context = waistContext(state.selectedDate);
  const heading = state.selectedDate === today ? "Hoy" : formatDay(state.selectedDate);
  const weekLine = context.week?.average != null
    ? `<p class="meta">Esta semana: ${formatDecimal(context.week.average, 1)} kg · ${context.week.daysWeighed} de 7 días</p>`
    : "";
  const waistNote = !context.show && context.week?.waistCm != null
    ? `<p class="meta">Cintura de esta semana: ${formatDecimal(context.week.waistCm, 1)} cm, el ${formatDay(context.week.waistDate)}. <button type="button" class="link" data-date="${context.week.waistDate}">Corregir</button></p>`
    : "";
  return `
    ${bannerHtml()}
    ${toast()}
    <section class="panel">
      <p class="eyebrow">${heading}</p>
      <h1>¿Cuánto pesaste?</h1>
      <form id="day-form">
        <label class="field">
          <span>Día</span>
          <input id="day" type="date" max="${today}" value="${state.selectedDate}" required>
        </label>
        <label class="field">
          <span>Peso</span>
          <div class="measure">
            <input id="weight" inputmode="decimal" autocomplete="off" enterkeyhint="done" maxlength="6" value="${fieldValue(existing?.weight_kg)}">
            <span>kg</span>
          </div>
        </label>
        ${context.show ? `
          <label class="field">
            <span>Cintura, si la mediste</span>
            <div class="measure">
              <input id="waist" inputmode="decimal" autocomplete="off" enterkeyhint="done" maxlength="6" value="${fieldValue(existing?.waist_cm)}">
              <span>cm</span>
            </div>
          </label>` : waistNote}
        <p class="form-error" id="form-error"></p>
        <button type="submit" class="btn primary">Guardar</button>
        ${existing ? `<button type="button" class="btn ghost" id="delete-day">Borrar este día</button>` : ""}
      </form>
      ${weekLine}
    </section>
    <div id="scales">${profileScales(state.profile.height_cm, latestWeight(state.entries), latestWaist(state.entries), true)}</div>
  `;
}

function semanasHtml() {
  const list = weeks();
  if (!list.length) {
    return `${toast()}<section class="panel"><h1>Semanas</h1><p class="lede">Cuando cargues el primer peso, la semana 1 empieza acá.</p></section>`;
  }
  const cards = [...list].reverse().map((week) => `
    <article class="card">
      <header>
        <div>
          <p class="eyebrow">Semana ${week.number}</p>
          <h2>${formatRange(week.start, week.end)}</h2>
        </div>
        ${week.inProgress ? `<span class="pill">En curso</span>` : ""}
      </header>
      <p class="figure">${week.average == null ? "—" : formatDecimal(week.average, 1)} <small>kg</small></p>
      <p class="meta">${week.daysWeighed} de 7 días ${deltaChip(week.weightDelta, "kg", week.weightComparedTo, week.number)}</p>
      ${week.days.length
        ? `<ul class="day-list">${week.days.map((day) => `<li><button type="button" data-date="${day.date}">${formatDay(day.date)} · ${formatDecimal(day.weight, 1)} kg</button></li>`).join("")}</ul>`
        : `<p class="meta">Sin pesos esta semana.</p>`}
    </article>
  `).join("");
  return `
    ${toast()}
    <section class="panel">
      <h1>Semanas</h1>
      <p class="lede">El promedio de los días que te pesaste. La comparación es con la semana anterior, no entre días.</p>
      ${trendBars(list)}
    </section>
    ${cards}
  `;
}

function cinturaHtml() {
  const list = weeks();
  if (!list.length) {
    return `${toast()}<section class="panel"><h1>Cintura</h1><p class="lede">Una medición por semana, a la altura del ombligo.</p></section>`;
  }
  const cards = [...list].reverse().map((week) => `
    <article class="card">
      <p class="eyebrow">Semana ${week.number} · ${formatRange(week.start, week.end)}</p>
      <p class="figure">${week.waistCm == null ? "—" : formatDecimal(week.waistCm, 1)} <small>cm</small></p>
      <p class="meta">${week.waistDate ? formatDay(week.waistDate) : "Sin medición"} ${deltaChip(week.waistDelta, "cm", week.waistComparedTo, week.number)}</p>
    </article>
  `).join("");
  return `${toast()}<section class="panel"><h1>Cintura</h1><p class="lede">Una vez por semana. Si la cargás de nuevo en la misma semana, reemplaza la anterior.</p></section>${cards}`;
}

function settingsHtml() {
  const permission = "Notification" in window ? Notification.permission : "unsupported";
  const notifyLabel = permission === "granted" ? "Recordatorio activado" : "Activar recordatorio";
  const weekOptions = WEEKDAY_OPTIONS.map((option) => `
    <option value="${option.value}" ${Number(state.profile.week_starts_on) === option.value ? "selected" : ""}>${option.label}</option>
  `).join("");
  const waistOptions = [`<option value="">Sin definir</option>`].concat(WEEKDAY_OPTIONS.map((option) => `
    <option value="${option.value}" ${state.profile.waist_weekday === option.value ? "selected" : ""}>${option.label}</option>
  `)).join("");
  const session = previewMode
    ? "Vista previa"
    : esc(state.user?.email || "tu cuenta");
  return `
    ${toast()}
    <section class="panel">
      <h1>Ajustes</h1>
      <p class="meta">Sesión: ${session}</p>
      <form id="settings-form">
        <label class="field">
          <span>La semana empieza</span>
          <select id="week-start">${weekOptions}</select>
        </label>
        <label class="field">
          <span>Horario del recordatorio</span>
          <input id="reminder" type="time" value="${esc(state.profile.reminder_time)}" required>
        </label>
        <label class="field">
          <span>Día de la cintura</span>
          <select id="waist-day">${waistOptions}</select>
        </label>
        <label class="field">
          <span>Altura</span>
          <div class="measure small">
            <input id="height" inputmode="decimal" autocomplete="off" maxlength="6" value="${fieldValue(state.profile.height_cm)}">
            <span>cm</span>
          </div>
        </label>
        <p class="form-error" id="form-error"></p>
        <button type="button" class="btn primary" id="notify">${notifyLabel}</button>
        <button type="button" class="btn ghost" id="export">Exportar registro</button>
        <button type="button" class="btn ghost" id="logout">${previewMode ? "Salir de la vista previa" : "Cerrar sesión"}</button>
      </form>
      <p class="fine">La notificación llega a la hora elegida si la app o la pestaña siguen abiertas. Al entrar, el aviso de arriba recuerda el peso de hoy.</p>
    </section>
  `;
}

function shellHtml() {
  const view = state.view === "semanas"
    ? semanasHtml()
    : state.view === "cintura"
      ? cinturaHtml()
      : state.view === "ajustes"
        ? settingsHtml()
        : hoyHtml();
  const tabs = [
    ["hoy", "Hoy"],
    ["semanas", "Semanas"],
    ["cintura", "Cintura"],
    ["ajustes", "Ajustes"],
  ];
  return `
    <div class="shell">
      ${previewRibbon()}
      <header class="top">
        <p class="brand">Mi balance</p>
        <p>${formatDay(todayISO())}</p>
      </header>
      <div id="view">${view}</div>
    </div>
    <nav class="nav">
      ${tabs.map(([id, label]) => `
        <button type="button" data-view="${id}" class="${state.view === id ? "active" : ""}" ${state.view === id ? "aria-current=\"page\"" : ""}>
          ${label}
        </button>
      `).join("")}
    </nav>
  `;
}

function trendBars(list) {
  const values = list.map((week) => week.average).filter((value) => value != null);
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(0.4, (max - min) * 0.25);
  const low = min - pad;
  const high = max + pad || low + 1;
  return `<div class="bars" aria-hidden="true">${list.map((week) => {
    const height = week.average == null ? 8 : 18 + ((week.average - low) / (high - low)) * 82;
    const way = direction(week.weightDelta);
    const tone = week.average == null ? "empty" : way === "up" ? "up" : "down";
    return `<div class="bar-col"><span class="bar ${tone}" style="height:${height}%"></span><small>${week.number}</small></div>`;
  }).join("")}</div>`;
}

function waistContext(date) {
  const week = weeks().find((item) => date >= item.start && date <= item.end) ?? null;
  const show = !week || week.waistCm == null || week.waistDate === date;
  return { week, show };
}

function paintScales(height, weight, waist, compact) {
  const slot = document.querySelector("#scales");
  if (slot) slot.innerHTML = profileScales(height, weight, waist, compact);
}

function bindDecimal(input, digits = 1) {
  if (!input) return;
  input.addEventListener("input", () => {
    const clean = sanitizeDecimal(input.value, digits);
    if (clean !== input.value) {
      const at = input.selectionStart;
      input.value = clean;
      input.setSelectionRange(at, at);
    }
  });
}

function bindLogin() {
  document.querySelector("#google").addEventListener("click", async () => {
    if (!isConfigured() || !state.supabase) {
      setFormError("Falta la URL y la clave anónima en js/config.js.");
      return;
    }
    setFormError("");
    try {
      const { signInWithGoogle } = await import("./auth.js");
      await signInWithGoogle(state.supabase);
    } catch (error) {
      setFormError(`No se pudo abrir Google. ${error.message || ""}`);
    }
  });
}

function bindOnboarding() {
  const height = document.querySelector("#height");
  const weight = document.querySelector("#weight");
  const waist = document.querySelector("#waist");
  [height, weight, waist].forEach((input) => bindDecimal(input, 1));
  const paint = () => {
    paintScales(parseDecimal(height.value), parseDecimal(weight.value), parseDecimal(waist.value), false);
  };
  [height, weight, waist].forEach((input) => input.addEventListener("input", paint));
  document.querySelector("#start-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const heightValue = parseDecimal(height.value);
    const weightValue = parseDecimal(weight.value);
    const waistValue = parseDecimal(waist.value);
    const problem = validate("height", heightValue) || validate("weight", weightValue) || validate("waist", waistValue);
    if (problem) {
      setFormError(problem);
      return;
    }
    const button = event.submitter;
    button.disabled = true;
    try {
      const today = todayISO();
      const next = nextEntries(state.entries, {
        date: today,
        weight: roundTo(weightValue, 1),
        waist: roundTo(waistValue, 1),
      }, state.profile?.week_starts_on ?? 1);
      await state.repo.saveEntries(next, state.entries);
      state.entries = next;
      state.profile = await state.repo.saveProfile({
        height_cm: roundTo(heightValue, 1),
        waist_weekday: weekday(today),
        onboarding_completed_at: new Date().toISOString(),
      });
      state.selectedDate = today;
      route();
    } catch (error) {
      button.disabled = false;
      setFormError(`No se pudo guardar. ${error.message || ""}`);
    }
  });
}

function readingForScales() {
  const weightInput = document.querySelector("#weight");
  const waistInput = document.querySelector("#waist");
  const typedWeight = weightInput ? parseDecimal(weightInput.value) : null;
  const typedWaist = waistInput ? parseDecimal(waistInput.value) : null;
  return {
    weight: typedWeight ?? latestWeight(state.entries),
    waist: typedWaist ?? latestWaist(state.entries),
  };
}

function bindHoy() {
  const form = document.querySelector("#day-form");
  if (!form) return;
  const day = document.querySelector("#day");
  const weight = document.querySelector("#weight");
  const waist = document.querySelector("#waist");
  bindDecimal(weight, 1);
  bindDecimal(waist, 1);
  const paint = () => {
    const reading = readingForScales();
    paintScales(state.profile.height_cm, reading.weight, reading.waist, true);
  };
  weight?.addEventListener("input", paint);
  waist?.addEventListener("input", paint);
  day.addEventListener("change", () => {
    state.selectedDate = day.value || todayISO();
    state.message = "";
    render();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveDay();
  });
  document.querySelector("#delete-day")?.addEventListener("click", deleteDay);
}

async function saveDay() {
  const date = document.querySelector("#day").value;
  if (!date || date > todayISO()) {
    setFormError("Ese día todavía no llegó.");
    return;
  }
  const existing = entryOn(state.entries, date);
  const weightInput = document.querySelector("#weight");
  const waistInput = document.querySelector("#waist");
  let weight = null;
  if (weightInput.value.trim()) {
    weight = parseDecimal(weightInput.value);
    const problem = weight == null ? "Ingresá un número." : validate("weight", weight);
    if (problem) {
      setFormError(problem);
      return;
    }
    weight = roundTo(weight, 1);
  }
  let waist;
  if (!waistInput) waist = undefined;
  else if (!waistInput.value.trim()) waist = null;
  else {
    const parsed = parseDecimal(waistInput.value);
    const problem = parsed == null ? "Ingresá un número." : validate("waist", parsed);
    if (problem) {
      setFormError(problem);
      return;
    }
    waist = roundTo(parsed, 1);
  }
  if (weight == null && (waist === undefined || waist == null)) {
    if (!existing) {
      setFormError("Ingresá el peso.");
      return;
    }
  }
  const button = document.querySelector("#day-form button[type='submit']");
  button.disabled = true;
  try {
    const next = nextEntries(state.entries, { date, weight, waist }, state.profile.week_starts_on);
    await state.repo.saveEntries(next, state.entries);
    state.entries = next;
    if (waist != null && state.profile.waist_weekday == null) {
      state.profile = await state.repo.saveProfile({ waist_weekday: weekday(date) });
    }
    state.selectedDate = date;
    state.message = "Guardado.";
    render();
  } catch (error) {
    button.disabled = false;
    setFormError(`No se pudo guardar. ${error.message || ""}`);
  }
}

async function deleteDay() {
  const date = state.selectedDate;
  const next = state.entries.filter((entry) => entry.entry_date !== date);
  try {
    await state.repo.saveEntries(next, state.entries);
    state.entries = next;
    state.message = "Día borrado.";
    render();
  } catch (error) {
    setFormError(`No se pudo borrar. ${error.message || ""}`);
  }
}

function bindShell() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.message = "";
      render();
    });
  });
  document.querySelector("#view").addEventListener("click", (event) => {
    const button = event.target.closest("[data-date]");
    if (!button || button.dataset.view) return;
    state.selectedDate = button.dataset.date;
    state.view = "hoy";
    state.message = "";
    render();
  });
  if (state.view === "hoy") bindHoy();
  if (state.view === "ajustes") bindSettings();
}

function bindSettings() {
  const height = document.querySelector("#height");
  bindDecimal(height, 1);
  document.querySelector("#settings-form").addEventListener("submit", (event) => event.preventDefault());
  document.querySelector("#week-start").addEventListener("change", (event) => {
    updateSetting({ week_starts_on: Number(event.target.value) }, true);
  });
  document.querySelector("#reminder").addEventListener("change", (event) => {
    if (!event.target.value) return;
    updateSetting({ reminder_time: event.target.value });
  });
  document.querySelector("#waist-day").addEventListener("change", (event) => {
    const value = event.target.value;
    updateSetting({ waist_weekday: value === "" ? null : Number(value) });
  });
  height.addEventListener("change", () => {
    const value = parseDecimal(height.value);
    const problem = validate("height", value);
    if (problem) {
      setFormError(problem);
      return;
    }
    updateSetting({ height_cm: roundTo(value, 1) });
  });
  document.querySelector("#notify").addEventListener("click", async () => {
    try {
      await enableNotifications();
      startReminder();
      state.message = "Listo. El recordatorio llega si la app sigue abierta.";
      render();
    } catch (error) {
      setFormError(error.message);
    }
  });
  document.querySelector("#export").addEventListener("click", exportData);
  document.querySelector("#logout").addEventListener("click", logout);
}

async function updateSetting(patch, reroute = false) {
  try {
    state.profile = await state.repo.saveProfile(patch);
    state.message = "Guardado.";
    if (reroute) route();
    else {
      render();
      startReminder();
    }
  } catch (error) {
    setFormError(`No se pudo guardar. ${error.message || ""}`);
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify({ profile: state.profile, entries: state.entries }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mi-balance.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function logout() {
  state.stopReminder();
  if (previewMode || !state.supabase) {
    window.location.href = "./";
    return;
  }
  try {
    const { signOut } = await import("./auth.js");
    await signOut(state.supabase);
  } catch (error) {
    state.message = `No se pudo cerrar la sesión. ${error.message || ""}`;
    render();
  }
}

async function finishReview() {
  const button = document.querySelector("#follow");
  if (button) button.disabled = true;
  try {
    state.profile = await state.repo.saveProfile({
      last_reviewed_week_start: state.review.week.start,
    });
    state.review = null;
    state.view = "hoy";
    route();
  } catch (error) {
    if (button) button.disabled = false;
    setFormError(`No se pudo guardar. ${error.message || ""}`);
  }
}

function render() {
  if (state.screen === "loading") {
    root.innerHTML = `<p class="loading">Cargando…</p>`;
    return;
  }
  if (state.screen === "login") {
    root.innerHTML = loginHtml();
    bindLogin();
    return;
  }
  if (state.screen === "onboarding") {
    root.innerHTML = onboardingHtml();
    bindOnboarding();
    return;
  }
  if (state.screen === "review") {
    mountWeekReview(root, {
      week: state.review.week,
      previous: state.review.previous,
      skipped: state.review.skipped,
      reduceMotion: state.reduceMotion,
      onDone: finishReview,
    });
    return;
  }
  root.innerHTML = shellHtml();
  bindShell();
}

function route() {
  if (!state.profile?.onboarding_completed_at) {
    state.stopReminder();
    state.screen = "onboarding";
    render();
    return;
  }
  const review = weekToReview(weeks(), state.profile.last_reviewed_week_start);
  if (review) {
    state.stopReminder();
    state.screen = "review";
    state.review = review;
    render();
    return;
  }
  state.screen = "main";
  render();
  startReminder();
}

function startReminder() {
  state.stopReminder();
  if (!state.profile?.reminder_time) return;
  state.stopReminder = scheduleReminder(state.profile.reminder_time, async () => {
    const messages = reminderMessages(state.profile, state.entries, todayISO());
    if (!messages.length) return;
    await showReminder(messages.join(" "));
  });
}

function applyLoaded(loaded) {
  state.user = loaded.user;
  state.profile = loaded.profile;
  state.entries = loaded.entries;
  route();
}

function homeSeed() {
  const today = todayISO();
  const start = weekStart(today, 1);
  const last = addDays(start, -7);
  const previous = addDays(start, -14);
  const entries = [];
  [0, 2, 4].forEach((offset, index) => {
    entries.push({
      entry_date: addDays(previous, offset),
      weight_kg: roundTo(83 - index * 0.3, 1),
      waist_cm: offset === 0 ? 92 : null,
    });
  });
  [0, 1, 3, 5].forEach((offset, index) => {
    entries.push({
      entry_date: addDays(last, offset),
      weight_kg: roundTo(81.6 - index * 0.2, 1),
      waist_cm: offset === 1 ? 90 : null,
    });
  });
  if (today !== start) {
    entries.push({ entry_date: start, weight_kg: 80.8, waist_cm: null });
  }
  return {
    profile: {
      height_cm: 172,
      week_starts_on: 1,
      reminder_time: "10:30",
      waist_weekday: weekday(today),
      onboarding_completed_at: "2026-10-01T12:00:00.000Z",
      last_reviewed_week_start: last,
    },
    entries,
  };
}

function reviewSeed() {
  const today = todayISO();
  const start = weekStart(today, 1);
  const last = addDays(start, -7);
  const previous = addDays(start, -14);
  const entries = [];
  [0, 1, 2, 4].forEach((offset, index) => {
    entries.push({
      entry_date: addDays(previous, offset),
      weight_kg: roundTo(82.4 - index * 0.1, 1),
      waist_cm: offset === 0 ? 91 : null,
    });
  });
  [0, 1, 3, 4, 6].forEach((offset, index) => {
    entries.push({
      entry_date: addDays(last, offset),
      weight_kg: roundTo(81.2 - index * 0.1, 1),
      waist_cm: offset === 0 ? 89 : null,
    });
  });
  return {
    profile: {
      height_cm: 170,
      week_starts_on: 1,
      reminder_time: "10:30",
      waist_weekday: weekday(last),
      onboarding_completed_at: "2026-10-01T12:00:00.000Z",
      last_reviewed_week_start: null,
    },
    entries,
  };
}

async function refresh() {
  const id = ++loadId;
  const loaded = await state.repo.load();
  if (id !== loadId) return;
  applyLoaded(loaded);
}

async function boot() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  if (previewMode) {
    const initial = previewKind === "review" ? reviewSeed() : previewKind === "home" ? homeSeed() : {};
    state.repo = createMemoryRepository(initial);
    await refresh();
    return;
  }
  if (!isConfigured()) {
    state.screen = "login";
    render();
    return;
  }
  const { createSupabase } = await import("./auth.js");
  state.supabase = createSupabase();
  state.repo = createRepository(state.supabase);
  state.supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(async () => {
      if (!session) {
        state.stopReminder();
        state.user = null;
        state.profile = null;
        state.entries = [];
        state.screen = "login";
        render();
        return;
      }
      try {
        await refresh();
      } catch (error) {
        state.screen = "login";
        state.message = `No se pudieron leer tus datos. ${error.message || ""}`;
        render();
      }
    }, 0);
  });
}

boot().catch((error) => {
  state.screen = "login";
  state.message = `No se pudo iniciar. ${error.message || ""}`;
  render();
});
