-- Mi balance
-- Pegá este archivo completo en el SQL Editor de Supabase y ejecutalo una vez.
-- Crea el perfil al registrarse con Google y deja que cada usuario vea solo lo suyo.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  height_cm numeric(5,1) check (height_cm > 0),
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  reminder_time text not null default '10:30',
  waist_weekday smallint check (waist_weekday between 0 and 6),
  onboarding_completed_at timestamptz,
  last_reviewed_week_start date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  weight_kg numeric(5,2) check (weight_kg > 0 and weight_kg < 500),
  waist_cm numeric(5,1) check (waist_cm > 0 and waist_cm < 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date),
  check (weight_kg is not null or waist_cm is not null)
);

create index entries_user_date_idx on public.entries (user_id, entry_date desc);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger entries_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.entries enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "entries_select_own" on public.entries
  for select using (auth.uid() = user_id);
create policy "entries_insert_own" on public.entries
  for insert with check (auth.uid() = user_id);
create policy "entries_update_own" on public.entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "entries_delete_own" on public.entries
  for delete using (auth.uid() = user_id);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.entries to authenticated;
