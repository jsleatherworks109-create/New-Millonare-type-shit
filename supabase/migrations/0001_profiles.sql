-- One row per user, holding their plan. Only the server (Stripe webhook) may change the plan.
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text,
  plan                text not null default 'free' check (plan in ('free', 'growth', 'scale')),
  stripe_customer_id  text unique,
  subscription_status text,
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own row. There is deliberately NO insert/update/delete policy,
-- so nobody can upgrade themselves from the browser; the service role bypasses RLS.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

-- Create a profile automatically whenever someone signs up (Google or email).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
