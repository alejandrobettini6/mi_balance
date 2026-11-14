const FIRESTORE = "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const PROFILE_FIELDS = [
  "height_cm",
  "week_starts_on",
  "reminder_time",
  "waist_weekday",
  "onboarding_completed_at",
  "last_reviewed_week_start",
  "data_reset_version",
];

const DATA_RESET_VERSION = 1;

const EMPTY_PROFILE = {
  height_cm: null,
  week_starts_on: 1,
  reminder_time: "10:30",
  waist_weekday: null,
  onboarding_completed_at: null,
  last_reviewed_week_start: null,
  data_reset_version: DATA_RESET_VERSION,
};

export function normalizeProfile(row) {
  if (!row) return null;
  return {
    height_cm: row.height_cm == null ? null : Number(row.height_cm),
    week_starts_on: row.week_starts_on == null ? 1 : Number(row.week_starts_on),
    reminder_time: String(row.reminder_time || "10:30").slice(0, 5),
    waist_weekday: row.waist_weekday == null ? null : Number(row.waist_weekday),
    onboarding_completed_at: row.onboarding_completed_at ?? null,
    last_reviewed_week_start: row.last_reviewed_week_start ?? null,
    data_reset_version: row.data_reset_version == null ? 0 : Number(row.data_reset_version),
  };
}

function mapEntry(row) {
  return {
    entry_date: row.entry_date,
    weight_kg: row.weight_kg == null ? null : Number(row.weight_kg),
    waist_cm: row.waist_cm == null ? null : Number(row.waist_cm),
  };
}

function profilePatch(patch) {
  const next = {};
  for (const field of PROFILE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) next[field] = patch[field];
  }
  return next;
}

export async function createRepository(db, auth) {
  const { collection, doc, getDoc, getDocs, setDoc, writeBatch } = await import(FIRESTORE);

  function currentUser() {
    const user = auth.currentUser;
    if (!user) throw new Error("No hay sesión.");
    return user;
  }

  function profileRef(uid) {
    return doc(db, "users", uid);
  }

  function entryRef(uid, date) {
    return doc(db, "users", uid, "entries", date);
  }

  async function deleteAllEntries(uid) {
    const entriesSnap = await getDocs(collection(db, "users", uid, "entries"));
    const docs = entriesSnap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const item of docs.slice(i, i + 400)) batch.delete(item.ref);
      await batch.commit();
    }
  }

  return {
    async load() {
      const user = auth.currentUser;
      if (!user) return { user: null, profile: null, entries: [] };

      const profileSnap = await getDoc(profileRef(user.uid));
      let profile = profileSnap.exists() ? profileSnap.data() : null;
      if (!profile || Number(profile.data_reset_version) !== DATA_RESET_VERSION) {
        await deleteAllEntries(user.uid);
        profile = { ...EMPTY_PROFILE };
        await setDoc(profileRef(user.uid), profile);
        return {
          user: { id: user.uid, email: user.email || "" },
          profile: normalizeProfile(profile),
          entries: [],
        };
      }

      const entriesSnap = await getDocs(collection(db, "users", user.uid, "entries"));
      const entries = entriesSnap.docs
        .map((item) => mapEntry({ entry_date: item.id, ...item.data() }))
        .sort((a, b) => a.entry_date.localeCompare(b.entry_date));

      return {
        user: { id: user.uid, email: user.email || "" },
        profile: normalizeProfile(profile),
        entries,
      };
    },

    async saveProfile(patch) {
      const user = currentUser();
      const ref = profileRef(user.uid);
      await setDoc(ref, profilePatch(patch), { merge: true });
      const snap = await getDoc(ref);
      return normalizeProfile(snap.data());
    },

    async saveEntries(next, previous) {
      const user = currentUser();
      const before = new Map(previous.map((entry) => [entry.entry_date, entry]));
      const after = new Map(next.map((entry) => [entry.entry_date, entry]));
      const batch = writeBatch(db);
      let pending = 0;

      for (const date of before.keys()) {
        if (!after.has(date)) {
          batch.delete(entryRef(user.uid, date));
          pending += 1;
        }
      }
      for (const [date, row] of after) {
        const old = before.get(date);
        if (!old || old.weight_kg !== row.weight_kg || old.waist_cm !== row.waist_cm) {
          batch.set(entryRef(user.uid, date), {
            weight_kg: row.weight_kg,
            waist_cm: row.waist_cm,
          });
          pending += 1;
        }
      }
      if (pending) await batch.commit();
    },
  };
}

export function createMemoryRepository(initial = {}) {
  const state = {
    user: { id: "preview", email: "vista previa" },
    profile: normalizeProfile({
      ...EMPTY_PROFILE,
      ...initial.profile,
    }),
    entries: (initial.entries ?? []).map(mapEntry),
  };

  return {
    async load() {
      return {
        user: state.user,
        profile: { ...state.profile },
        entries: state.entries.map((entry) => ({ ...entry })),
      };
    },
    async saveProfile(patch) {
      state.profile = normalizeProfile({ ...state.profile, ...profilePatch(patch) });
      return { ...state.profile };
    },
    async saveEntries(next) {
      state.entries = next.map((entry) => ({ ...entry }));
    },
  };
}
