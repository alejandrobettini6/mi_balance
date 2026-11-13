import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig, isConfigured } from "./config.js";

export function createFirebase() {
  if (!isConfigured()) return null;
  const app = initializeApp(firebaseConfig);
  return { auth: getAuth(app), db: getFirestore(app) };
}

export function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

export async function signInWithGoogle(auth) {
  await signInWithPopup(auth, googleProvider());
}

export function describeAuthError(error) {
  const code = error?.code || "";
  if (code === "auth/unauthorized-domain") {
    return "Este dominio no está autorizado en Firebase. En Authentication → Settings → Authorized domains tiene que estar el dominio de esta página.";
  }
  if (code === "auth/operation-not-allowed") {
    return "El ingreso con Google no está activado. En Firebase: Authentication → Sign-in method → Google.";
  }
  if (code === "auth/popup-blocked") {
    return "El navegador bloqueó la ventana de Google. Permití las ventanas emergentes para este sitio y volvé a intentar.";
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Se cerró la ventana de Google antes de terminar el ingreso.";
  }
  return `No se pudo entrar con Google. ${error?.message || "Probá de nuevo."}`;
}

export function completeRedirect(auth) {
  return getRedirectResult(auth);
}

export function watchAuth(auth, onUser) {
  return onAuthStateChanged(auth, onUser);
}

export async function signOut(auth) {
  await firebaseSignOut(auth);
}
