const PROFILE_FIELDS = [
  "height_cm",
  "week_starts_on",
  "reminder_time",
  "waist_weekday",
  "onboarding_completed_at",
  "last_reviewed_week_start",
];

export function normalizeProfile(row) {
  if (!row) return null;
  return {
    height_cm: row.height_cm == null ? null : Number(row.height_cm),
    week_starts_on: row.week_starts_on == null ? 1 : Number(row.week_starts_on),
    reminder_time: String(row.reminder_time || "10:30").slice(0, 5),
    waist_weekday: row.waist_weekday == null ? null : Number(row.waist_weekday),
    onboarding_completed_at: row.onboarding_completed_at ?? null,
    last_reviewed_week_start: row.last_reviewed_week_start ?? null,
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

export function createRepository(supabase) {
  return {
    async load() {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const user = userData.user;
      if (!user) return { user: null, profile: null, entries: [] };

      let { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;

      if (!profile) {
        const inserted = await supabase.from("profiles").insert({ id: user.id }).select("*").single();
        if (inserted.error) throw inserted.error;
        profile = inserted.data;
      }

      const { data: entries, error: entriesError } = await supabase
        .from("entries")
        .select("entry_date, weight_kg, waist_cm")
        .eq("user_id", user.id)
        .order("entry_date", { ascending: true });
      if (entriesError) throw entriesError;

      return {
        user,
        profile: normalizeProfile(profile),
        entries: (entries ?? []).map(mapEntry),
      };
    },

    async saveProfile(patch) {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const { data, error } = await supabase
        .from("profiles")
        .update(profilePatch(patch))
        .eq("id", userData.user.id)
        .select("*")
        .single();
      if (error) throw error;
      return normalizeProfile(data);
    },

    async saveEntries(next, previous) {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const userId = userData.user.id;
      const before = new Map(previous.map((entry) => [entry.entry_date, entry]));
      const after = new Map(next.map((entry) => [entry.entry_date, entry]));
      const toDelete = [];
      const toUpsert = [];

      for (const date of before.keys()) {
        if (!after.has(date)) toDelete.push(date);
      }
      for (const [date, row] of after) {
        const old = before.get(date);
        if (!old || old.weight_kg !== row.weight_kg || old.waist_cm !== row.waist_cm) {
          toUpsert.push(row);
        }
      }

      if (toDelete.length) {
        const { error } = await supabase.from("entries").delete().eq("user_id", userId).in("entry_date", toDelete);
        if (error) throw error;
      }
      if (toUpsert.length) {
        const { error } = await supabase.from("entries").upsert(
          toUpsert.map((row) => ({
            user_id: userId,
            entry_date: row.entry_date,
            weight_kg: row.weight_kg,
            waist_cm: row.waist_cm,
          })),
          { onConflict: "user_id,entry_date" },
        );
        if (error) throw error;
      }
    },
  };
}

export function createMemoryRepository(initial = {}) {
  const state = {
    user: { id: "preview", email: "vista previa" },
    profile: normalizeProfile({
      height_cm: null,
      week_starts_on: 1,
      reminder_time: "10:30",
      waist_weekday: null,
      onboarding_completed_at: null,
      last_reviewed_week_start: null,
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
