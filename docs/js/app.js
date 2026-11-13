(() => {
  "use strict";

  const STORAGE_KEY = "mi-balance-logs";
  const WEEK_STARTS_ON = 1; // lunes
  const DAY_LETTERS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
  const MONTHS = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];

  // Umbrales temporales de tendencia (semana actual vs anterior).
  // Peso: |Δ| < 0.3 kg → amarillo (te mantuviste); Δ ≤ −0.3 → verde (bajaste); Δ ≥ 0.3 → rojo (subiste).
  // Cintura: |Δ| < 0.5 cm → amarillo; Δ ≤ −0.5 → verde; Δ ≥ 0.5 → rojo.
  const WEIGHT_TREND_KG = 0.3;
  const WAIST_TREND_CM = 0.5;

  const state = {
    logs: {},
    selected: todayISO(),
    viewMonth: startOfMonth(todayISO()),
  };

  const els = {
    monthLabel: document.querySelector("#month-label"),
    calendar: document.querySelector("#calendar"),
    selectedLabel: document.querySelector("#selected-label"),
    form: document.querySelector("#day-form"),
    peso: document.querySelector("#peso"),
    cintura: document.querySelector("#cintura"),
    error: document.querySelector("#form-error"),
    weekRange: document.querySelector("#week-range"),
    avgWeight: document.querySelector("#avg-weight"),
    avgWaist: document.querySelector("#avg-waist"),
    weightCard: document.querySelector("#weight-card"),
    waistCard: document.querySelector("#waist-card"),
    weightTrend: document.querySelector("#weight-trend"),
    waistTrend: document.querySelector("#waist-trend"),
    compare: document.querySelector("#compare-text"),
    dayStatus: document.querySelector("#day-status"),
    weekDots: document.querySelector("#week-dots"),
    prevMonth: document.querySelector("#prev-month"),
    nextMonth: document.querySelector("#next-month"),
    reset: document.querySelector("#reset-demo"),
  };

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function parseISO(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatISO(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function todayISO(now = new Date()) {
    return formatISO(now);
  }

  function addDays(iso, days) {
    const date = parseISO(iso);
    date.setDate(date.getDate() + days);
    return formatISO(date);
  }

  function startOfWeek(iso) {
    const date = parseISO(iso);
    const diff = (date.getDay() - WEEK_STARTS_ON + 7) % 7;
    date.setDate(date.getDate() - diff);
    return formatISO(date);
  }

  function startOfMonth(iso) {
    const date = parseISO(iso);
    date.setDate(1);
    return formatISO(date);
  }

  function addMonths(iso, delta) {
    const date = parseISO(iso);
    date.setMonth(date.getMonth() + delta);
    return formatISO(date);
  }

  function roundTo(value, digits) {
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
  }

  function formatNumber(value, digits = 1) {
    return new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  function parseDecimal(raw) {
    const text = String(raw ?? "").trim().replace(",", ".");
    if (!text) return null;
    if (!/^\d+(\.\d+)?$/.test(text)) return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  }

  function loadLogs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveLogs() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.logs));
  }

  function isEmptyLogs(logs) {
    return !logs || Object.keys(logs).length === 0;
  }

  function seedLogs() {
    const today = todayISO();
    const thisMonday = startOfWeek(today);
    const week1 = addDays(thisMonday, -14);
    const week2 = addDays(thisMonday, -7);
    const logs = {};

    const put = (iso, peso, cintura) => {
      if (iso > today) return;
      if (iso === today) return;
      logs[iso] = { peso, cintura: cintura ?? null };
    };

    // Semana 1 (primera, sin comparación): peso ~82.1 kg, cintura ~92.8 cm. Días faltantes.
    put(addDays(week1, 0), 82.4, 93);
    put(addDays(week1, 2), 82.1, null);
    put(addDays(week1, 3), 82.0, 92.5);
    put(addDays(week1, 5), 81.8, null);
    put(addDays(week1, 6), 82.2, 92.8);

    // Semana 2: baja respecto de la 1 (verde).
    put(addDays(week2, 0), 81.4, 91.5);
    put(addDays(week2, 1), 81.2, null);
    put(addDays(week2, 3), 81.0, 91.0);
    put(addDays(week2, 4), 80.9, null);
    put(addDays(week2, 6), 81.1, 90.8);

    // Semana 3 (la que contiene hoy): sube de peso (rojo); cintura casi igual (amarillo).
    put(addDays(thisMonday, 0), 81.5, 91.2);
    put(addDays(thisMonday, 2), 81.7, null);
    put(addDays(thisMonday, 3), 81.9, 91.3);

    return logs;
  }

  function weekDays(monday) {
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }

  function average(values) {
    if (!values.length) return null;
    return roundTo(values.reduce((sum, n) => sum + n, 0) / values.length, 1);
  }

  function weekStats(monday) {
    const days = weekDays(monday);
    const weights = [];
    const waists = [];
    for (const iso of days) {
      const log = state.logs[iso];
      if (!log) continue;
      if (log.peso != null) weights.push(Number(log.peso));
      if (log.cintura != null) waists.push(Number(log.cintura));
    }
    return {
      monday,
      sunday: days[6],
      days,
      avgWeight: average(weights),
      avgWaist: average(waists),
      weightCount: weights.length,
      waistCount: waists.length,
    };
  }

  function trendKind(delta, threshold) {
    if (delta == null) return null;
    if (Math.abs(delta) < threshold) return "same";
    return delta <= -threshold ? "down" : "up";
  }

  function firstTrackedMonday() {
    const dates = Object.keys(state.logs).sort();
    if (!dates.length) return null;
    return startOfWeek(dates[0]);
  }

  function formatDayLong(iso) {
    const date = parseISO(iso);
    const weekday = date.toLocaleDateString("es-AR", { weekday: "long" });
    return `${weekday} ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
  }

  function formatRange(start, end) {
    const from = parseISO(start);
    const to = parseISO(end);
    if (from.getMonth() === to.getMonth()) {
      return `${from.getDate()}–${to.getDate()} de ${MONTHS[from.getMonth()]}`;
    }
    return `${from.getDate()} de ${MONTHS[from.getMonth()]} – ${to.getDate()} de ${MONTHS[to.getMonth()]}`;
  }

  function trendLabel(kind, unit) {
    if (kind === "down") return unit === "kg" ? "Bajando" : "Bajando";
    if (kind === "up") return unit === "kg" ? "Subiendo" : "Subiendo";
    if (kind === "same") return "Sin cambio relevante";
    return "";
  }

  function compareSentence(current, previous) {
    if (current.avgWeight == null) {
      return "Esta semana todavía no tiene un promedio de peso.";
    }
    if (!previous || previous.avgWeight == null) {
      return "Esta es tu primera semana de registro. Todavía no hay una semana anterior para comparar.";
    }
    const delta = roundTo(current.avgWeight - previous.avgWeight, 1);
    const kind = trendKind(delta, WEIGHT_TREND_KG);
    const verb =
      kind === "down" ? "bajaste de peso" : kind === "up" ? "subiste de peso" : "te mantuviste";
    return `Comparado con la semana pasada, ${verb}. Tu promedio anterior fue de ${formatNumber(previous.avgWeight)} kg y tu promedio actual es de ${formatNumber(current.avgWeight)} kg.`;
  }

  function setCard(card, trendEl, kind, label) {
    card.classList.remove("down", "up", "same");
    if (kind) card.classList.add(kind);
    if (kind) {
      trendEl.hidden = false;
      trendEl.textContent = label;
    } else {
      trendEl.hidden = true;
      trendEl.textContent = "";
    }
  }

  function renderCalendar() {
    const monthDate = parseISO(state.viewMonth);
    els.monthLabel.textContent = `${MONTHS[monthDate.getMonth()]} ${monthDate.getFullYear()}`;
    const first = state.viewMonth;
    const gridStart = startOfWeek(first);
    const today = todayISO();
    const cells = [`<span class="dow">Lu</span>`, `<span class="dow">Ma</span>`, `<span class="dow">Mi</span>`, `<span class="dow">Ju</span>`, `<span class="dow">Vi</span>`, `<span class="dow">Sá</span>`, `<span class="dow">Do</span>`];
    for (let i = 0; i < 42; i += 1) {
      const iso = addDays(gridStart, i);
      const date = parseISO(iso);
      const other = date.getMonth() !== monthDate.getMonth();
      const classes = ["day"];
      if (other) classes.push("other");
      if (iso === state.selected) classes.push("selected");
      if (state.logs[iso]?.peso != null) classes.push("has");
      const disabled = iso > today ? "disabled" : "";
      cells.push(
        `<button type="button" class="${classes.join(" ")}" data-day="${iso}" ${disabled} aria-pressed="${iso === state.selected}">${date.getDate()}</button>`,
      );
    }
    els.calendar.innerHTML = cells.join("");
  }

  function renderForm() {
    els.selectedLabel.textContent = formatDayLong(state.selected);
    const log = state.logs[state.selected];
    els.peso.value = log?.peso != null ? String(log.peso) : "";
    els.cintura.value = log?.cintura != null ? String(log.cintura) : "";
    els.error.hidden = true;
    els.error.textContent = "";
  }

  function renderAverages() {
    const monday = startOfWeek(state.selected);
    const current = weekStats(monday);
    const previousMonday = addDays(monday, -7);
    const firstMonday = firstTrackedMonday();
    const isFirstWeek = !firstMonday || monday <= firstMonday;
    const previous = isFirstWeek ? null : weekStats(previousMonday);
    const weightDelta =
      current.avgWeight != null && previous?.avgWeight != null
        ? roundTo(current.avgWeight - previous.avgWeight, 1)
        : null;
    const waistDelta =
      current.avgWaist != null && previous?.avgWaist != null
        ? roundTo(current.avgWaist - previous.avgWaist, 1)
        : null;
    const weightKind = trendKind(weightDelta, WEIGHT_TREND_KG);
    const waistKind = trendKind(waistDelta, WAIST_TREND_CM);

    els.weekRange.textContent = `Semana del ${formatRange(current.monday, current.sunday)} (lunes a domingo)`;
    els.avgWeight.textContent = current.avgWeight == null ? "—" : formatNumber(current.avgWeight);
    els.avgWaist.textContent = current.avgWaist == null ? "—" : formatNumber(current.avgWaist);
    setCard(
      els.weightCard,
      els.weightTrend,
      isFirstWeek ? null : weightKind,
      trendLabel(weightKind, "kg"),
    );
    setCard(
      els.waistCard,
      els.waistTrend,
      isFirstWeek ? null : waistKind,
      trendLabel(waistKind, "cm"),
    );
    els.compare.textContent = compareSentence(current, isFirstWeek ? null : previous);

    const todayLog = state.logs[state.selected];
    if (!todayLog || todayLog.peso == null) {
      els.dayStatus.textContent = "Todavía no te pesaste hoy.";
      els.dayStatus.classList.add("empty");
    } else {
      const waistBit =
        todayLog.cintura != null
          ? ` y ${formatNumber(todayLog.cintura)} cm de cintura`
          : "";
      els.dayStatus.textContent = `Guardado: ${formatNumber(todayLog.peso)} kg${waistBit}.`;
      els.dayStatus.classList.remove("empty");
    }

    els.weekDots.innerHTML = current.days
      .map((iso) => {
        const logged = state.logs[iso]?.peso != null;
        const letter = DAY_LETTERS[parseISO(iso).getDay()];
        return `<li>
          <button type="button" data-day="${iso}" ${iso > todayISO() ? "disabled" : ""}>
            <div class="dot ${logged ? "logged" : ""} ${iso === state.selected ? "selected" : ""}"></div>
            ${letter}
          </button>
        </li>`;
      })
      .join("");
  }

  function render() {
    renderCalendar();
    renderForm();
    renderAverages();
  }

  function selectDay(iso) {
    if (!iso || iso > todayISO()) return;
    state.selected = iso;
    const month = startOfMonth(iso);
    if (month !== state.viewMonth) state.viewMonth = month;
    render();
  }

  function showError(text) {
    els.error.hidden = false;
    els.error.textContent = text;
  }

  function saveDay(event) {
    event.preventDefault();
    if (state.selected > todayISO()) {
      showError("Ese día todavía no llegó.");
      return;
    }
    const peso = parseDecimal(els.peso.value);
    const cinturaRaw = els.cintura.value.trim();
    const cintura = cinturaRaw ? parseDecimal(els.cintura.value) : null;
    if (peso == null) {
      showError("Ingresá el peso.");
      return;
    }
    if (peso < 30 || peso > 300) {
      showError("El peso tiene que estar entre 30 y 300 kg.");
      return;
    }
    if (cinturaRaw && cintura == null) {
      showError("Ingresá un número de cintura.");
      return;
    }
    if (cintura != null && (cintura < 40 || cintura > 200)) {
      showError("La cintura tiene que estar entre 40 y 200 cm.");
      return;
    }
    state.logs[state.selected] = {
      peso: roundTo(peso, 1),
      cintura: cintura == null ? null : roundTo(cintura, 1),
    };
    saveLogs();
    render();
  }

  function boot() {
    const stored = loadLogs();
    state.logs = isEmptyLogs(stored) ? seedLogs() : stored;
    if (isEmptyLogs(stored)) saveLogs();
    els.form.addEventListener("submit", saveDay);
    els.calendar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-day]");
      if (!button || button.disabled) return;
      selectDay(button.dataset.day);
    });
    els.weekDots.addEventListener("click", (event) => {
      const button = event.target.closest("[data-day]");
      if (!button || button.disabled) return;
      selectDay(button.dataset.day);
    });
    els.prevMonth.addEventListener("click", () => {
      state.viewMonth = addMonths(state.viewMonth, -1);
      renderCalendar();
    });
    els.nextMonth.addEventListener("click", () => {
      state.viewMonth = addMonths(state.viewMonth, 1);
      renderCalendar();
    });
    els.reset.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      state.logs = seedLogs();
      saveLogs();
      state.selected = todayISO();
      state.viewMonth = startOfMonth(state.selected);
      render();
    });
    render();
  }

  boot();
})();
