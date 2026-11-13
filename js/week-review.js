import { formatDecimal } from "./body.js";
import { direction, formatRange } from "./weeks.js";

function story(delta, unit) {
  const way = direction(delta);
  if (!way) return null;
  const amount = formatDecimal(Math.abs(delta), 1);
  if (way === "same") {
    return { way, title: "Te mantuviste", detail: `Igual que la semana anterior.` };
  }
  if (way === "down") {
    return { way, title: "Bajaste", detail: `${amount} ${unit} respecto de la semana anterior.` };
  }
  return { way, title: "Subiste", detail: `${amount} ${unit} respecto de la semana anterior.` };
}

function animateNumber(element, from, to, duration) {
  if (to == null) {
    element.textContent = "—";
    return;
  }
  if (duration <= 0 || from == null) {
    element.textContent = formatDecimal(to, 1);
    return;
  }
  const start = performance.now();
  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = formatDecimal(from + (to - from) * eased, 1);
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

export function mountWeekReview(root, { week, previous, skipped, reduceMotion, onDone }) {
  const weight = story(week.weightDelta, "kg");
  const waist = week.waistCm == null ? null : story(week.waistDelta, "cm");
  const duration = reduceMotion ? 0 : 1100;
  const from = previous?.average ?? week.average;

  root.innerHTML = `
    <section class="review">
      <p class="eyebrow">Pasó la semana</p>
      <h1>${formatRange(week.start, week.end)}</h1>
      <p class="review-kicker">Semana ${week.number}${week.average == null ? "" : ""}</p>
      <p class="review-value" data-value>${week.average == null ? "—" : formatDecimal(from ?? week.average, 1)}</p>
      <p class="review-unit">${week.average == null ? "Sin pesos esta semana" : "kg de promedio"}</p>
      <div class="review-story ${weight?.way ?? "same"}" data-story hidden>
        <p class="review-title">${weight ? weight.title : "Primera semana cerrada"}</p>
        <p>${weight ? weight.detail : "A partir de ahora vas a ver si bajás o subís."}</p>
      </div>
      <div class="dots" aria-label="Días pesados">
        ${Array.from({ length: 7 }, (_, index) => `<span class="dot" data-dot="${index}"></span>`).join("")}
      </div>
      <p class="review-days">Te pesaste ${week.daysWeighed} de 7 días.</p>
      ${
        week.waistCm == null
          ? ""
          : `<p class="review-waist ${waist?.way ?? ""}">Cintura ${formatDecimal(week.waistCm, 1)} cm${
              waist ? ` · ${waist.title.toLowerCase()} ${waist.detail.charAt(0).toLowerCase()}${waist.detail.slice(1)}` : ""
            }</p>`
      }
      ${skipped ? `<p class="review-skipped">${skipped === 1 ? "Quedó 1 semana sin abrir en el medio." : `Quedaron ${skipped} semanas sin abrir en el medio.`} Esta es la última.</p>` : ""}
      <p class="form-error" id="form-error"></p>
      <button type="button" class="btn primary" id="follow">Seguir</button>
    </section>
  `;

  const value = root.querySelector("[data-value]");
  const storyBox = root.querySelector("[data-story]");
  const dots = [...root.querySelectorAll("[data-dot]")];

  animateNumber(value, from, week.average, duration);

  const revealAt = duration > 0 ? duration * 0.72 : 0;
  window.setTimeout(() => {
    storyBox.hidden = false;
    dots.forEach((dot, index) => {
      if (index >= week.daysWeighed) return;
      window.setTimeout(() => dot.classList.add("on"), duration > 0 ? index * 90 : 0);
    });
  }, revealAt);

  root.querySelector("#follow").addEventListener("click", onDone);
}
