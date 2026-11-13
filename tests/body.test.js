import assert from "node:assert/strict";
import test from "node:test";
import {
  bmi,
  bmiZone,
  idealMessage,
  kgFromIdeal,
  markerPosition,
  parseDecimal,
  sanitizeDecimal,
  waistHeightRatio,
  whtrZone,
} from "../js/body.js";

test("el IMC usa los cortes de la OMS", () => {
  assert.equal(bmiZone(18.49).id, "under");
  assert.equal(bmiZone(18.5).id, "normal");
  assert.equal(bmiZone(24.9).id, "normal");
  assert.equal(bmiZone(25).label, "Sobrepeso");
  assert.match(bmiZone(25.4).hint, /Apenas/);
  assert.match(bmiZone(27).hint, /Apenas/);
  assert.equal(bmiZone(27.1).hint, "");
  assert.equal(bmiZone(30).id, "obese");
});

test("el mensaje dice a cuántos kilos está del rango ideal", () => {
  assert.equal(kgFromIdeal(70, 170), 0);
  assert.equal(idealMessage(bmiZone(24.2), 70, 170), "Estás en tu rango ideal.");
  assert.match(idealMessage(bmiZone(25.4), 73.5, 170), /Apenas en sobrepeso, a unos \d+ kg de tu ideal/);
  assert.match(idealMessage(bmiZone(31), 90, 170), /Obesidad, a unos \d+ kg de tu ideal/);
  assert.match(idealMessage(bmiZone(17), 50, 170), /por debajo de tu ideal/);
});

test("la relación cintura-altura marca el límite de la mitad", () => {
  assert.equal(whtrZone(0.39).id, "low");
  assert.equal(whtrZone(0.4).id, "healthy");
  assert.equal(whtrZone(0.49).id, "healthy");
  assert.equal(whtrZone(0.5).id, "raised");
  assert.equal(whtrZone(0.6).id, "high");
});

test("los cálculos y el marcador se quedan dentro de la escala", () => {
  assert.equal(Math.round(bmi(70, 170) * 10) / 10, 24.2);
  assert.equal(Math.round(waistHeightRatio(85, 170) * 100) / 100, 0.5);
  assert.equal(markerPosition(10, 15, 40), 0);
  assert.equal(markerPosition(50, 15, 40), 1);
  assert.equal(bmi(null, 170), null);
});

test("los campos aceptan coma y rechazan letras", () => {
  assert.equal(parseDecimal("80,4"), 80.4);
  assert.equal(parseDecimal("80.4"), 80.4);
  assert.equal(parseDecimal(""), null);
  assert.equal(parseDecimal("80kg"), null);
  assert.equal(sanitizeDecimal("80a,44x", 1), "80,4");
  assert.equal(sanitizeDecimal("12.345", 1), "12.3");
});
