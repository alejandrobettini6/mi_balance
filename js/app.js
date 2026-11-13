import {
  BMI_MAX,
  BMI_MIN,
  WHTR_MAX,
  WHTR_MIN,
  bmi,
  bmiGradient,
  bmiZone,
  idealMessage,
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
  signedDelta,
  todayISO,
  weekStart,
  weekToReview,
  weekday,
  weekdayLabel,
} from "./weeks.js";

const root = document.querySelector("#app");
const params = new URLSearchParams(window.location.search);
const previewMode = params.has("preview") && (location.hostname === "localhost" || !isConfigured());
const previewKind = params.get("preview") || "onboarding";

const state = {
  screen: "loading",
  view: "hoy",
  user: null,
  profile: null,
  entries: [],
  selectedDate: todayISO(),
  message: "",
  auth: null,
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

function describeDataError(error) {
  const code = error?.code || "";
  const message = error?.message || "";
  if (code === "permission-denied") {
    return "La cuenta entró, pero Firestore rechazó los datos. Publicá las reglas de firebase/firestore.rules.";
  }
  if (code === "not-found" || code === "unavailable" || message.includes("NOT_FOUND")) {
    return "La cuenta entró, pero Firestore no está creado. Creá la base en modo producción.";
  }
  return `La cuenta entró, pero no se pudieron leer los datos. ${message}`;
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
      zone: { ...bmiZone(bmiValue), hint: idealMessage(bmiZone(bmiValue), weight, height) },
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
        <p>Para entrar con Google, completá la configuración de Firebase en <code>js/config.js</code>. Las reglas están en <code>firebase/firestore.rules</code>.</p>
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

const DAY_LETTERS = { 0: "Do", 1: "Lu", 2: "Ma", 3: "Mi", 4: "Ju", 5: "Vi", 6: "Sá" };

function signedText(delta, digits = 1) {
  if (delta == null) return "";
  if (delta === 0) return "0";
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${formatDecimal(Math.abs(delta), digits)}`;
}

function journey() {
  const list = weeks();
  const weighed = list.filter((week) => week.average != null);
  if (!weighed.length) return null;
  const waists = list.filter((week) => week.waistCm != null);
  return {
    list,
    first: weighed[0],
    latest: weighed.at(-1),
    total: weighed.length > 1 ? signedDelta(weighed.at(-1).average, weighed[0].average, 1) : null,
    current: list.find((week) => week.inProgress) ?? weighed.at(-1),
    latestWaist: waists.at(-1) ?? null,
    waistTotal: waists.length > 1 ? signedDelta(waists.at(-1).waistCm, waists[0].waistCm, 1) : null,
  };
}

function ringSvg(list) {
  const weighed = list.filter((week) => week.average != null);
  const radius = 46;
  const turn = 2 * Math.PI * radius;
  if (weighed.length < 2) {
    return `<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="${radius}" fill="none" stroke="#d9d1c6" stroke-width="11"/>
    </svg>`;
  }
  const shown = weighed.slice(-12);
  const count = shown.length;
  const length = (turn / count) * 0.72;
  const arcs = shown.map((week, index) => {
    const way = direction(week.weightDelta);
    const color = index === 0 && weighed.length <= 12 ? "#7ecfc8" : way === "up" ? "#c2542a" : way === "same" ? "#b7aea3" : "#0e6b66";
    const offset = (turn * index) / count;
    return `<circle cx="60" cy="60" r="${radius}" fill="none" stroke="${color}" stroke-width="11" stroke-dasharray="${length} ${turn - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
  }).join("");
  return `<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">${arcs}</svg>`;
}

function heroHtml() {
  const story = journey();
  if (!story) {
    return `
      <section class="hero">
        <p class="eyebrow">Tu camino</p>
        <h1>Todavía no hay un peso.</h1>
        <p class="lede">Cuando lo cargues, acá vas a ver cuánto venís bajando.</p>
      </section>`;
  }
  const way = direction(story.total) || "start";
  const number = story.total == null ? formatDecimal(story.current.average, 1) : formatDecimal(Math.abs(story.total), 1);
  const sign = story.total == null || story.total === 0 ? "" : story.total > 0 ? "+" : "−";
  const label = story.total == null
    ? "Promedio de esta semana"
    : way === "down"
      ? "Bajaste desde el inicio"
      : way === "up"
        ? "Subiste desde el inicio"
        : "Igual que al inicio";
  const weekLine = story.current?.average == null
    ? "Esta semana todavía sin peso."
    : story.current.weightDelta != null
      ? `Esta semana ${signedText(story.current.weightDelta)} kg`
      : `Esta semana ${formatDecimal(story.current.average, 1)} kg`;
  const waistLine = story.latestWaist
    ? `Cintura ${formatDecimal(story.latestWaist.waistCm, 1)} cm${story.waistTotal == null ? "" : ` · ${signedText(story.waistTotal)} cm`}`
    : "";
  const windowNote = story.list.filter((week) => week.average != null).length > 12
    ? `<p class="fine">El anillo muestra las últimas 12 semanas.</p>`
    : "";
  return `
    <section class="hero ${way}">
      <div class="ring-wrap">
        ${ringSvg(story.list)}
        <div class="ring-center">
          <h1>${sign}${number}</h1>
          <small>kg</small>
        </div>
      </div>
      <p class="hero-label">${label}</p>
      <p class="meta">${weekLine}</p>
      ${waistLine ? `<p class="meta">${waistLine}</p>` : ""}
      ${windowNote}
    </section>
  `;
}

function dayStrip(selected) {
  const start = weekStart(selected, state.profile?.week_starts_on ?? 1);
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const entry = entryOn(state.entries, date);
    const classes = [
      "day-dot",
      date === selected ? "selected" : "",
      entry?.weight_kg != null ? "has" : "",
    ].filter(Boolean).join(" ");
    const future = date > today;
    return `<button type="button" class="${classes}" data-day="${date}" ${future ? "disabled" : ""} aria-pressed="${date === selected}" aria-label="${formatDay(date)}">
      <span>${DAY_LETTERS[weekday(date)]}</span>
      <strong>${Number(date.slice(8))}</strong>
    </button>`;
  }).join("");
  return `<div class="day-strip" role="group" aria-label="${formatRange(start, addDays(start, 6))}">${days}</div>`;
}

function hoyHtml() {
  const today = todayISO();
  const existing = entryOn(state.entries, state.selectedDate);
  const week = weeks().find((item) => state.selectedDate >= item.start && state.selectedDate <= item.end) ?? null;
  const heading = state.selectedDate === today ? "Hoy" : formatDay(state.selectedDate);
  const waistElsewhere = week?.waistCm != null && week.waistDate !== state.selectedDate
    ? `<p class="meta">Esta semana ya tiene ${formatDecimal(week.waistCm, 1)} cm, el ${formatDay(week.waistDate)}.</p>`
    : "";
  return `
    ${bannerHtml()}
    ${toast()}
    ${heroHtml()}
    <section class="panel log">
      <h2>${esc(heading)}</h2>
      <form id="day-form">
        ${dayStrip(state.selectedDate)}
        <label class="field">
          <span>Peso</span>
          <div class="measure">
            <input id="weight" inputmode="decimal" autocomplete="off" enterkeyhint="done" maxlength="6" value="${fieldValue(existing?.weight_kg)}">
            <span>kg</span>
          </div>
        </label>
        <label class="field">
          <span>Cintura, si la mediste</span>
          <div class="measure small">
            <input id="waist" inputmode="decimal" autocomplete="off" enterkeyhint="done" maxlength="6" value="${fieldValue(existing?.waist_cm)}">
            <span>cm</span>
          </div>
        </label>
        ${waistElsewhere}
        <p class="form-error" id="form-error"></p>
        <button type="submit" class="btn primary">Guardar</button>
      </form>
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
      <div class="stats">
        <div>
          <span>Peso</span>
          <strong>${week.average == null ? "—" : formatDecimal(week.average, 1)}</strong>
          <em>kg ${deltaChip(week.weightDelta, "kg", week.weightComparedTo, week.number)}</em>
        </div>
        <div>
          <span>Cintura</span>
          <strong>${week.waistCm == null ? "—" : formatDecimal(week.waistCm, 1)}</strong>
          <em>cm ${deltaChip(week.waistDelta, "cm", week.waistComparedTo, week.number)}</em>
        </div>
      </div>
      <p class="meta">${week.daysWeighed} de 7 días${week.waistDate ? ` · cintura el ${formatDay(week.waistDate)}` : ""}</p>
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
      <h2 class="chart-title">Peso</h2>
      ${chartBars(list, "weight")}
      <h2 class="chart-title">Cintura</h2>
      ${list.some((week) => week.waistCm != null) ? chartBars(list, "waist") : `<p class="meta">Cuando midas la cintura, el gráfico aparece acá.</p>`}
    </section>
    ${cards}
  `;
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
    : state.view === "ajustes"
      ? settingsHtml()
      : hoyHtml();
  const tabs = [
    ["hoy", "Inicio"],
    ["semanas", "Semanas"],
    ["ajustes", "Ajustes"],
  ];
  return `
    <div class="shell">
      ${previewRibbon()}
      <header class="top">
        <p class="brand">Mi balance</p>
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

function chartBars(list, kind) {
  const valueOf = (week) => (kind === "waist" ? week.waistCm : week.average);
  const deltaOf = (week) => (kind === "waist" ? week.waistDelta : week.weightDelta);
  const values = list.map(valueOf).filter((value) => value != null);
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(kind === "waist" ? 0.6 : 0.4, (max - min) * 0.25);
  const low = min - pad;
  const high = max + pad || low + 1;
  const digits = kind === "waist" ? 0 : 1;
  return `<div class="bars">${list.map((week) => {
    const value = valueOf(week);
    const height = value == null ? 8 : 18 + ((value - low) / (high - low)) * 82;
    const way = direction(deltaOf(week));
    const tone = value == null ? "empty" : way === "up" ? "up" : "down";
    const reading = value == null ? "sin dato" : `${formatDecimal(value, digits)} ${kind === "waist" ? "cm" : "kg"}`;
    return `<div class="bar-col" title="${esc(formatRange(week.start, week.end))} · ${reading}">
      <small class="bar-read">${value == null ? "" : formatDecimal(value, digits)}</small>
      <span class="bar-track"><span class="bar ${tone}" style="height:${height}%"></span></span>
      <small>${formatDay(week.start)}</small>
    </div>`;
  }).join("")}</div>`;
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
    if (!isConfigured() || !state.auth) {
      setFormError("Falta la configuración de Firebase en js/config.js.");
      return;
    }
    setFormError("");
    let describe = (error) => error?.message || "No se pudo entrar con Google.";
    try {
      const auth = await import("./auth.js");
      describe = auth.describeAuthError;
      await auth.signInWithGoogle(state.auth);
    } catch (error) {
      setFormError(describe(error));
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
  form.addEventListener("click", (event) => {
    const button = event.target.closest("[data-day]");
    if (!button || button.disabled) return;
    state.selectedDate = button.dataset.day;
    state.message = "";
    render();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveDay();
  });
}

async function saveDay() {
  const date = state.selectedDate;
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
  if (previewMode || !state.auth) {
    window.location.href = "./";
    return;
  }
  try {
    const { signOut } = await import("./auth.js");
    await signOut(state.auth);
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

function startSeed() {
  const today = todayISO();
  const start = weekStart(today, 1);
  return {
    profile: {
      height_cm: 172,
      week_starts_on: 1,
      reminder_time: "10:30",
      waist_weekday: weekday(today),
      onboarding_completed_at: "2026-11-01T12:00:00.000Z",
      last_reviewed_week_start: start,
    },
    entries: [{ entry_date: today === start ? today : start, weight_kg: 80.4, waist_cm: 90 }],
  };
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
  if (location.hostname === "127.0.0.1") {
    const url = new URL(location.href);
    url.hostname = "localhost";
    location.replace(url);
    return;
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  if (previewMode) {
    const initial = previewKind === "review" ? reviewSeed() : previewKind === "home" ? homeSeed() : previewKind === "start" ? startSeed() : {};
    state.repo = createMemoryRepository(initial);
    await refresh();
    return;
  }
  if (!isConfigured()) {
    state.screen = "login";
    render();
    return;
  }
  const { completeRedirect, createFirebase, describeAuthError, watchAuth } = await import("./auth.js");
  const firebase = createFirebase();
  state.auth = firebase.auth;
  state.repo = await createRepository(firebase.db, firebase.auth);
  try {
    await completeRedirect(state.auth);
  } catch (error) {
    state.message = describeAuthError(error);
  }
  watchAuth(state.auth, (user) => {
    if (!user) {
      state.stopReminder();
      state.user = null;
      state.profile = null;
      state.entries = [];
      state.screen = "login";
      render();
      return;
    }
    refresh().catch((error) => {
      state.screen = "login";
      state.message = describeDataError(error);
      render();
    });
  });
}

boot().catch((error) => {
  state.screen = "login";
  state.message = `No se pudo iniciar. ${error.message || ""}`;
  render();
});
