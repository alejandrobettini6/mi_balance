import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeeks,
  formatRange,
  nextEntries,
  signedDelta,
  weekStart,
  weekToReview,
} from "../js/weeks.js";

test("la semana se alinea al día elegido", () => {
  assert.equal(weekStart("2026-11-12", 1), "2026-11-09");
  assert.equal(weekStart("2026-11-12", 5), "2026-11-06");
  assert.equal(weekStart("2026-11-09", 1), "2026-11-09");
  assert.equal(formatRange("2026-11-02", "2026-11-08"), "2–8 nov");
});

test("el promedio ignora los días vacíos y salta una semana sin pesos", () => {
  const weeks = buildWeeks([
    { entry_date: "2026-11-02", weight_kg: 80, waist_cm: null },
    { entry_date: "2026-11-04", weight_kg: 82, waist_cm: 90 },
    { entry_date: "2026-11-18", weight_kg: 79, waist_cm: null },
  ], 1, "2026-11-18");

  assert.deepEqual(weeks.map((week) => week.number), [1, 2, 3]);
  assert.equal(weeks[0].average, 81);
  assert.equal(weeks[0].daysWeighed, 2);
  assert.equal(weeks[0].closed, true);
  assert.equal(weeks[1].average, null);
  assert.equal(weeks[1].daysWeighed, 0);
  assert.equal(weeks[2].inProgress, true);
  assert.equal(weeks[2].weightDelta, signedDelta(79, 81, 1));
  assert.equal(weeks[2].weightComparedTo, 1);
  assert.equal(weeks[1].weightDelta, null);
});

test("una segunda cintura en la misma semana reemplaza la anterior", () => {
  const first = nextEntries([], { date: "2026-11-02", weight: 80, waist: 90 }, 1);
  const second = nextEntries(first, { date: "2026-11-04", weight: 81, waist: 88 }, 1);
  assert.equal(second.find((entry) => entry.entry_date === "2026-11-02").waist_cm, null);
  assert.equal(second.find((entry) => entry.entry_date === "2026-11-04").waist_cm, 88);

  const otherWeek = nextEntries(second, { date: "2026-11-10", weight: 80, waist: 87 }, 1);
  assert.equal(otherWeek.find((entry) => entry.entry_date === "2026-11-04").waist_cm, 88);
  assert.equal(otherWeek.find((entry) => entry.entry_date === "2026-11-10").waist_cm, 87);
});

test("borrar el peso y la cintura saca el día", () => {
  const entries = nextEntries([], { date: "2026-11-02", weight: 80, waist: 90 }, 1);
  const cleared = nextEntries(entries, { date: "2026-11-02", weight: null, waist: null }, 1);
  assert.equal(cleared.length, 0);
});

test("el cierre muestra la última semana cerrada una sola vez", () => {
  const weeks = buildWeeks([
    { entry_date: "2026-11-02", weight_kg: 82, waist_cm: 91 },
    { entry_date: "2026-11-09", weight_kg: 80, waist_cm: 89 },
  ], 1, "2026-11-18");

  const pending = weekToReview(weeks, null);
  assert.equal(pending.week.start, "2026-11-09");
  assert.equal(pending.previous.start, "2026-11-02");
  assert.equal(pending.skipped, 1);
  assert.equal(pending.week.weightDelta, -2);

  assert.equal(weekToReview(weeks, "2026-11-09"), null);
  assert.equal(weekToReview(weeks, "2026-11-02").week.start, "2026-11-09");
  assert.equal(weekToReview(weeks, "2026-11-02").skipped, 0);
});
