# Mi balance

Registro de peso y cintura. El promedio de cada semana muestra si bajaste o subiste, sin comparar un día contra el otro.

Es una página estática. La cuenta entra con Google y los datos quedan en Supabase, cada persona con lo suyo.

## 1. Base de datos

En el proyecto de Supabase, abrí **SQL Editor**, pegá el contenido de [`supabase/schema.sql`](supabase/schema.sql) y ejecutalo una vez.

Eso crea:

- `profiles`: altura, día en que empieza la semana, horario del recordatorio, día de la cintura y qué semana ya se mostró al abrir la app.
- `entries`: un peso y, si se midió, una cintura por fecha.
- El perfil vacío apenas alguien se registra con Google.
- Las políticas para que cada usuario lea y escriba solo sus filas.

La cintura es una por semana. Si se carga otra en la misma semana, la app reemplaza la anterior. El corte de la semana depende del día elegido en Ajustes, así que esa regla vive en la app y no en una restricción de la tabla.

## 2. Google

1. En [Google Cloud](https://console.cloud.google.com/), creá un cliente OAuth de tipo **Aplicación web**.
2. En **URI de redireccionamiento autorizados** poné `https://<referencia>.supabase.co/auth/v1/callback`.
3. En Supabase, **Authentication → Providers → Google**, pegá el client id y el client secret.
4. En **Authentication → URL Configuration**:
   - **Site URL**: la dirección de GitHub Pages, por ejemplo `https://<usuario>.github.io/mi_balance/`.
   - **Redirect URLs**: esa misma dirección y, si vas a probar en tu máquina, `http://127.0.0.1:4173/`.

Tiene que coincidir exactamente con la dirección desde la que se abre la app, incluida la barra final.

## 3. Claves

En [`js/config.js`](js/config.js) completá la URL del proyecto y la clave **anon**.

Esa clave es pública: va en el sitio. No pongas la clave `service_role`.

## 4. GitHub Pages

En el repositorio, **Settings → Pages → Deploy from a branch**. Rama `main` (o la rama que publiques) y carpeta `/ (root)`.

La dirección va a ser `https://<usuario>.github.io/mi_balance/`. Agregala en Supabase, como en el paso 2, antes de probar **Continuar con Google**.

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
