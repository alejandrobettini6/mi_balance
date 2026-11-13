import assert from "node:assert/strict";
import test from "node:test";
import { msUntilTime, reminderMessages } from "../js/notifications.js";

test("el recordatorio espera hasta la hora elegida, o hasta mañana si ya pasó", () => {
  const morning = new Date(2026, 10, 12, 10, 0, 0, 0);
  assert.equal(msUntilTime("10:30", morning), 30 * 60 * 1000);

  const exact = new Date(2026, 10, 12, 10, 30, 0, 0);
  assert.equal(msUntilTime("10:30", exact), 24 * 60 * 60 * 1000);

  const later = new Date(2026, 10, 12, 11, 0, 0, 0);
  assert.equal(msUntilTime("10:30", later), 23.5 * 60 * 60 * 1000);
});

test("el aviso del día nombra el peso y, si toca, la cintura", () => {
  const profile = { week_starts_on: 1, waist_weekday: 4, reminder_time: "10:30" };
  const thursday = "2026-11-12";
  assert.deepEqual(reminderMessages(profile, [], thursday), [
    "Hoy todavía no registraste tu peso.",
    "Hoy es el día de medir la cintura.",
  ]);

  const weighed = [{ entry_date: thursday, weight_kg: 80, waist_cm: null }];
  assert.deepEqual(reminderMessages(profile, weighed, thursday), [
    "Hoy es el día de medir la cintura.",
  ]);

  const done = [{ entry_date: thursday, weight_kg: 80, waist_cm: 90 }];
  assert.deepEqual(reminderMessages(profile, done, thursday), []);

  assert.deepEqual(reminderMessages(profile, [], "2026-11-11"), [
    "Hoy todavía no registraste tu peso.",
  ]);
});
