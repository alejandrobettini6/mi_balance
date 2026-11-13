import { addDays, weekStart, weekday } from "./weeks.js";

export function msUntilTime(hhmm, now = new Date()) {
  const [hours, minutes] = String(hhmm || "10:30").split(":").map(Number);
  const next = new Date(now);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function reminderMessages(profile, entries, today) {
  const messages = [];
  const weighedToday = entries.some((entry) => entry.entry_date === today && entry.weight_kg != null);
  if (!weighedToday) messages.push("Hoy todavía no registraste tu peso.");

  if (profile?.waist_weekday != null && weekday(today) === Number(profile.waist_weekday)) {
    const start = weekStart(today, profile.week_starts_on ?? 1);
    const end = addDays(start, 6);
    const measured = entries.some(
      (entry) => entry.waist_cm != null && entry.entry_date >= start && entry.entry_date <= end,
    );
    if (!measured) messages.push("Hoy es el día de medir la cintura.");
  }

  return messages;
}

let timer = 0;

export function scheduleReminder(time, onFire) {
  window.clearTimeout(timer);
  const wait = msUntilTime(time);
  timer = window.setTimeout(async () => {
    await onFire();
    scheduleReminder(time, onFire);
  }, wait);
  return () => window.clearTimeout(timer);
}

export async function enableNotifications() {
  if (!("Notification" in window)) {
    throw new Error("Este navegador no muestra notificaciones.");
  }
  const result = await Notification.requestPermission();
  if (result !== "granted") {
    throw new Error("El permiso quedó bloqueado. Podés activarlo desde la configuración del navegador.");
  }
}

export async function showReminder(body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const options = { body, icon: "./icons/icon-192.png", lang: "es" };
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration) {
      await registration.showNotification("Mi balance", options);
      return;
    }
  } catch {
    // Si el service worker no está listo, la notificación de la página alcanza.
  }
  new Notification("Mi balance", options);
}
