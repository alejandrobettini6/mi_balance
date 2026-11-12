import { roundTo } from "./body.js";

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function parseISODate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatISODate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayISO(now = new Date()) {
  return formatISODate(now);
}

export function addDays(iso, days) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return formatISODate(date);
}

export function weekday(iso) {
  return parseISODate(iso).getDay();
}

export function weekdayLabel(value) {
  return WEEKDAY_OPTIONS.find((option) => option.value === Number(value))?.label ?? "";
}

export function weekStart(iso, weekStartsOn) {
  const date = parseISODate(iso);
  const diff = (date.getDay() - Number(weekStartsOn) + 7) % 7;
  date.setDate(date.getDate() - diff);
  return formatISODate(date);
}

export function weekEnd(startIso) {
  return addDays(startIso, 6);
}

export function formatDay(iso) {
  const date = parseISODate(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatRange(start, end) {
  const from = parseISODate(start);
  const to = parseISODate(end);
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `${from.getDate()}–${to.getDate()} ${MONTHS[from.getMonth()]}`;
  }
  return `${formatDay(start)} – ${formatDay(end)}`;
}

export function signedDelta(current, previous, digits = 1) {
  if (current == null || previous == null) return null;
  const factor = 10 ** digits;
  const left = Math.round(Number(current) * factor) / factor;
  const right = Math.round(Number(previous) * factor) / factor;
  return Math.round((left - right) * factor) / factor;
}

export function direction(delta) {
  if (delta == null) return null;
  if (delta === 0) return "same";
  return delta < 0 ? "down" : "up";
}

export function buildWeeks(entries, weekStartsOn, today = todayISO()) {
  const weighed = entries.filter((entry) => entry.weight_kg != null);
  if (!weighed.length) return [];

  const firstDate = weighed.map((entry) => entry.entry_date).sort()[0];
  let cursor = weekStart(firstDate, weekStartsOn);
  const last = weekStart(today, weekStartsOn);
  const grouped = new Map();

  for (const entry of entries) {
    const start = weekStart(entry.entry_date, weekStartsOn);
    if (start < cursor || start > last) continue;
    if (!grouped.has(start)) grouped.set(start, []);
    grouped.get(start).push(entry);
  }

  const weeks = [];
  let number = 1;
  while (cursor <= last) {
    const days = grouped.get(cursor) ?? [];
    const weights = days.filter((day) => day.weight_kg != null);
    const waists = days
      .filter((day) => day.waist_cm != null)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    const waist = waists.at(-1) ?? null;
    const average = weights.length
      ? roundTo(weights.reduce((sum, day) => sum + Number(day.weight_kg), 0) / weights.length, 1)
      : null;

    weeks.push({
      number,
      start: cursor,
      end: weekEnd(cursor),
      inProgress: cursor <= today && today <= weekEnd(cursor),
      closed: weekEnd(cursor) < today,
      average,
      daysWeighed: weights.length,
      days: weights
        .map((day) => ({ date: day.entry_date, weight: Number(day.weight_kg) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      waistCm: waist ? roundTo(waist.waist_cm, 1) : null,
      waistDate: waist ? waist.entry_date : null,
      weightDelta: null,
      weightComparedTo: null,
      waistDelta: null,
      waistComparedTo: null,
    });
    number += 1;
    cursor = addDays(cursor, 7);
  }

  let previousWeight = null;
  let previousWaist = null;
  for (const week of weeks) {
    if (previousWeight && week.average != null) {
      week.weightDelta = signedDelta(week.average, previousWeight.average, 1);
      week.weightComparedTo = previousWeight.number;
    }
    if (previousWaist && week.waistCm != null) {
      week.waistDelta = signedDelta(week.waistCm, previousWaist.waistCm, 1);
      week.waistComparedTo = previousWaist.number;
    }
    if (week.average != null) previousWeight = week;
    if (week.waistCm != null) previousWaist = week;
  }

  return weeks;
}

export function weekToReview(weeks, lastReviewedStart) {
  const closed = weeks.filter((week) => week.closed);
  if (!closed.length) return null;
  const latest = closed.at(-1);
  if (lastReviewedStart && latest.start <= lastReviewedStart) return null;
  const skipped = closed.filter(
    (week) => week.start < latest.start && (!lastReviewedStart || week.start > lastReviewedStart),
  ).length;
  const previous = [...weeks].reverse().find((week) => week.start < latest.start && week.average != null) ?? null;
  return { week: latest, previous, skipped };
}

export function nextEntries(entries, change, weekStartsOn) {
  const list = entries.map((entry) => ({ ...entry }));
  let row = list.find((entry) => entry.entry_date === change.date);
  if (!row) {
    row = { entry_date: change.date, weight_kg: null, waist_cm: null };
    list.push(row);
  }

  row.weight_kg = change.weight;
  if (change.waist !== undefined) {
    if (change.waist != null) {
      const start = weekStart(change.date, weekStartsOn);
      for (const entry of list) {
        if (entry.entry_date === change.date || entry.waist_cm == null) continue;
        if (weekStart(entry.entry_date, weekStartsOn) === start) entry.waist_cm = null;
      }
    }
    row.waist_cm = change.waist;
  }

  return list
    .filter((entry) => entry.weight_kg != null || entry.waist_cm != null)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
}

export function entryOn(entries, date) {
  return entries.find((entry) => entry.entry_date === date) ?? null;
}
