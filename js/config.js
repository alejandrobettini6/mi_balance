// Configuración pública de la app web de Firebase.
// La seguridad está en las reglas de Firestore, no en ocultar estos valores.
export const firebaseConfig = {
  apiKey: "AIzaSyBaC4J9nhsEvO2I4cTJGjWQbpBEruvCdRc",
  authDomain: "mibalance-fd741.firebaseapp.com",
  projectId: "mibalance-fd741",
  storageBucket: "mibalance-fd741.firebasestorage.app",
  messagingSenderId: "49402079682",
  appId: "1:49402079682:web:5d11a7212443e45c5e8e5b",
  measurementId: "G-2KH6D5BC7Z",
};

export function isConfigured() {
  const { apiKey, authDomain, projectId, appId } = firebaseConfig;
  return [apiKey, authDomain, projectId, appId].every((value) => typeof value === "string" && value.length > 0)
    && !apiKey.includes("YOUR_API_KEY")
    && !authDomain.includes("YOUR_PROJECT")
    && !projectId.includes("YOUR_PROJECT")
    && !appId.includes("YOUR_APP_ID");
}
