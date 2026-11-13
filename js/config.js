// Completá estos valores con la app web de Firebase.
// Están en Configuración del proyecto → Tus apps. Son públicos: la seguridad está en las reglas.
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  appId: "YOUR_APP_ID",
};

export function isConfigured() {
  const { apiKey, authDomain, projectId, appId } = firebaseConfig;
  return [apiKey, authDomain, projectId, appId].every((value) => typeof value === "string" && value.length > 0)
    && !apiKey.includes("YOUR_API_KEY")
    && !authDomain.includes("YOUR_PROJECT")
    && !projectId.includes("YOUR_PROJECT")
    && !appId.includes("YOUR_APP_ID");
}
