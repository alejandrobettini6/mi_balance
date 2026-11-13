import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig, isConfigured } from "./config.js";

export function createFirebase() {
  if (!isConfigured()) return null;
  const app = initializeApp(firebaseConfig);
  return { auth: getAuth(app), db: getFirestore(app) };
}

export async function signInWithGoogle(auth) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithRedirect(auth, provider);
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
