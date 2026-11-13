# Mi balance

Registro de peso y cintura. El promedio de cada semana muestra si bajaste o subiste, sin comparar un día contra el otro.

Es una página estática. La cuenta entra con Google y los datos quedan en Firestore, cada persona con lo suyo.

Los datos son de una sola persona: un perfil y un día por fecha. No hay relaciones entre usuarios ni consultas que crucen tablas, así que Firestore encaja mejor que una base relacional.

## 1. Firebase

1. Creá un proyecto en [Firebase](https://console.firebase.google.com/).
2. **Authentication → Sign-in method → Google**, y activalo.
3. **Authentication → Settings → Authorized domains**: agregá el dominio de GitHub Pages, por ejemplo `<usuario>.github.io`. `localhost` ya viene habilitado.
4. **Firestore Database → Create database**. Elegí el modo de producción.
5. En **Firestore → Rules**, pegá [`firebase/firestore.rules`](firebase/firestore.rules) y publicalo.

Eso deja dos lugares por usuario:

- `users/{uid}`: altura, día en que empieza la semana, horario del recordatorio, día de la cintura y qué semana ya se mostró.
- `users/{uid}/entries/{fecha}`: el peso y, si se midió, la cintura de ese día. La fecha es el id, por ejemplo `2026-11-12`.

Cada usuario solo lee y escribe su carpeta. La cintura sigue siendo una por semana: si se carga otra en la misma semana, la app reemplaza la anterior.

## 2. Claves

En **Configuración del proyecto → Tus apps**, creá una app web y copiá la configuración a [`js/config.js`](js/config.js): `apiKey`, `authDomain`, `projectId` y `appId`.

Esos valores son públicos. No hace falta una clave de administrador en el sitio.

## 3. GitHub Pages

En el repositorio, **Settings → Pages → Deploy from a branch**. Rama publicada y carpeta `/ (root)`.

La dirección va a ser `https://<usuario>.github.io/mi_balance/`. Agregala como dominio autorizado en Firebase antes de probar **Continuar con Google**.

## Qué hace la app

- **Continuar con Google** abre la sesión y crea la cuenta si ese mail no existía.
- El primer ingreso pide altura, peso y cintura, y muestra el índice de masa corporal y la relación cintura-altura en una escala de color.
- Cada día se puede cargar el peso, también un día anterior. La cintura se ofrece una vez por semana.
- **Semanas** lista el promedio y cuántos días hubo registro. La diferencia es contra la semana anterior con datos.
- Al abrir la app, si una semana ya cerró y todavía no se mostró, una pantalla anima el resultado: bajaste, subiste o te mantuviste.
- En **Ajustes** se elige el día en que empieza la semana, el horario del recordatorio y el día de la cintura. También se exporta el registro en JSON.

El recordatorio a la hora elegida (10:30 por defecto) se muestra si la pestaña o la app instalada siguen abiertas. GitHub Pages no puede despertar el teléfono con la app cerrada. Al entrar, igual aparece el aviso si falta el peso de hoy.

## Vista previa sin claves

Mientras `js/config.js` tenga los valores de ejemplo:

- `?preview=1` muestra el formulario inicial.
- `?preview=home` muestra una semana de ejemplo.
- `?preview=review` muestra el cierre de semana.

Esos datos no salen del navegador y desaparecen al recargar. Cuando las claves están cargadas, la vista previa no se usa.

## Pruebas

```bash
npm test
```
