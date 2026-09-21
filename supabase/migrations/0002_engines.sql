-- Selamont engines: content history, store analyses, drops + waitlists + analytics,
-- creator marketplace, and admin accounts. Run after 0001_profiles.sql.

alter table public.profiles add column if not exists is_admin boolean not null default false;

-- True when the user has a paid plan or is an admin. SECURITY DEFINER so policies can call it.
create or replace function public.has_paid_plan(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and (p.plan in ('growth', 'scale') or p.is_admin)
  );
$$;

/* ---------------- Content Engine + Store Analyzer history ---------------- */

create table if not exists public.content_generations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  product_name text,
  input        jsonb,
  output       jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists content_generations_user_idx on public.content_generations (user_id, created_at desc);
alter table public.content_generations enable row level security;
drop policy if exists "own generations read" on public.content_generations;
create policy "own generations read" on public.content_generations for select using (user_id = auth.uid());
drop policy if exists "own generations delete" on public.content_generations;
create policy "own generations delete" on public.content_generations for delete using (user_id = auth.uid());

create table if not exists public.store_analyses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  url        text not null,
  score      int,
  result     jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists store_analyses_user_idx on public.store_analyses (user_id, created_at desc);
alter table public.store_analyses enable row level security;
drop policy if exists "own analyses read" on public.store_analyses;
create policy "own analyses read" on public.store_analyses for select using (user_id = auth.uid());
drop policy if exists "own analyses delete" on public.store_analyses;
create policy "own analyses delete" on public.store_analyses for delete using (user_id = auth.uid());

/* ---------------- Drops & launches ---------------- */

create table if not exists public.drops (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  title       text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 4000),
  image_url   text,
  price       text,
  store_url   text,
  launch_at   timestamptz not null,
  quantity    int check (quantity is null or quantity > 0),
  status      text not null default 'draft' check (status in ('draft', 'live', 'ended')),
  created_at  timestamptz not null default now()
);
create index if not exists drops_user_idx on public.drops (user_id, created_at desc);
alter table public.drops enable row level security;

create or replace function public.drop_count(uid uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.drops where user_id = uid;
$$;

drop policy if exists "drops public or own read" on public.drops;
create policy "drops public or own read" on public.drops for select
  using (status in ('live', 'ended') or user_id = auth.uid());
-- Starter plan: one launch page. Paid plans and admins: unlimited.
drop policy if exists "drops create" on public.drops;
create policy "drops create" on public.drops for insert
  with check (user_id = auth.uid() and (public.has_paid_plan(auth.uid()) or public.drop_count(auth.uid()) < 1));
drop policy if exists "drops own update" on public.drops;
create policy "drops own update" on public.drops for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "drops own delete" on public.drops;
create policy "drops own delete" on public.drops for delete using (user_id = auth.uid());

create or replace function public.owns_drop(did uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.drops d where d.id = did and d.user_id = auth.uid());
$$;

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  drop_id    uuid not null references public.drops (id) on delete cascade,
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  created_at timestamptz not null default now(),
  unique (drop_id, email)
);
alter table public.waitlist enable row level security;
-- Anyone (even signed out) may join the waitlist of a live drop, but only the owner can read it.
drop policy if exists "waitlist join" on public.waitlist;
create policy "waitlist join" on public.waitlist for insert to anon, authenticated
  with check (exists (select 1 from public.drops d where d.id = drop_id and d.status = 'live'));
drop policy if exists "waitlist owner read" on public.waitlist;
create policy "waitlist owner read" on public.waitlist for select using (public.owns_drop(drop_id));
drop policy if exists "waitlist owner delete" on public.waitlist;
create policy "waitlist owner delete" on public.waitlist for delete using (public.owns_drop(drop_id));

create table if not exists public.drop_events (
  id         bigint generated always as identity primary key,
  drop_id    uuid not null references public.drops (id) on delete cascade,
  type       text not null check (type in ('view', 'click', 'signup')),
  visitor_id text check (char_length(visitor_id) <= 64),
  created_at timestamptz not null default now()
);
create index if not exists drop_events_drop_idx on public.drop_events (drop_id, created_at);
alter table public.drop_events enable row level security;
drop policy if exists "events record" on public.drop_events;
create policy "events record" on public.drop_events for insert to anon, authenticated
  with check (exists (select 1 from public.drops d where d.id = drop_id and d.status in ('live', 'ended')));
drop policy if exists "events owner read" on public.drop_events;
create policy "events owner read" on public.drop_events for select using (public.owns_drop(drop_id));

/* ---------------- Creator marketplace ---------------- */

create table if not exists public.creator_profiles (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 80),
  niche         text,
  bio           text check (char_length(bio) <= 1000),
  instagram     text,
  tiktok        text,
  youtube       text,
  audience_size int check (audience_size is null or audience_size >= 0),
  portfolio_url text,
  contact_email text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.creator_profiles enable row level security;
drop policy if exists "creators visible to members" on public.creator_profiles;
create policy "creators visible to members" on public.creator_profiles for select to authenticated using (true);
drop policy if exists "creator own insert" on public.creator_profiles;
create policy "creator own insert" on public.creator_profiles for insert with check (user_id = auth.uid());
drop policy if exists "creator own update" on public.creator_profiles;
create policy "creator own update" on public.creator_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.briefs (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand_name     text not null check (char_length(brand_name) between 1 and 80),
  contact_email  text,
  title          text not null check (char_length(title) between 1 and 120),
  product        text not null check (char_length(product) between 1 and 200),
  description    text check (char_length(description) <= 4000),
  requirements   text check (char_length(requirements) <= 2000),
  commission_pct numeric(5, 2) not null check (commission_pct > 0 and commission_pct <= 90),
  product_value  numeric(10, 2) check (product_value is null or product_value >= 0),
  platforms      text[] not null default '{}',
  status         text not null default 'open' check (status in ('open', 'closed')),
  created_at     timestamptz not null default now()
);
alter table public.briefs enable row level security;
drop policy if exists "briefs visible to members" on public.briefs;
create policy "briefs visible to members" on public.briefs for select to authenticated using (true);
drop policy if exists "brief own insert" on public.briefs;
create policy "brief own insert" on public.briefs for insert with check (brand_id = auth.uid());
drop policy if exists "brief own update" on public.briefs;
create policy "brief own update" on public.briefs for update using (brand_id = auth.uid()) with check (brand_id = auth.uid());
drop policy if exists "brief own delete" on public.briefs;
create policy "brief own delete" on public.briefs for delete using (brand_id = auth.uid());

create table if not exists public.applications (
  id            uuid primary key default gen_random_uuid(),
  brief_id      uuid not null references public.briefs (id) on delete cascade,
  creator_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pitch         text check (char_length(pitch) <= 2000),
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'declined', 'submitted', 'approved')),
  content_url   text,
  referral_code text,
  sales_total   numeric(12, 2) not null default 0 check (sales_total >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (brief_id, creator_id)
);
alter table public.applications enable row level security;

create or replace function public.owns_brief(bid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.briefs b where b.id = bid and b.brand_id = auth.uid());
$$;

drop policy if exists "applications parties read" on public.applications;
create policy "applications parties read" on public.applications for select
  using (creator_id = auth.uid() or public.owns_brief(brief_id));
drop policy if exists "applications creator apply" on public.applications;
create policy "applications creator apply" on public.applications for insert
  with check (
    creator_id = auth.uid()
    and status = 'pending'
    and sales_total = 0
    and referral_code is null
    and not public.owns_brief(brief_id)
    and exists (select 1 from public.briefs b where b.id = brief_id and b.status = 'open')
    and exists (select 1 from public.creator_profiles c where c.user_id = auth.uid())
  );
drop policy if exists "applications parties update" on public.applications;
create policy "applications parties update" on public.applications for update
  using (creator_id = auth.uid() or public.owns_brief(brief_id));

-- Each side may only make the changes that belong to them.
create or replace function public.guard_application_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  is_brand boolean := public.owns_brief(old.brief_id);
  is_creator boolean := old.creator_id = auth.uid();
  base text;
begin
  if auth.uid() is null then
    return new; -- service role / SQL editor
  end if;
  if new.brief_id <> old.brief_id or new.creator_id <> old.creator_id then
    raise exception 'Cannot move an application';
  end if;

  if is_brand then
    if new.pitch is distinct from old.pitch or new.content_url is distinct from old.content_url then
      raise exception 'Brands cannot edit the creator''s pitch or content';
    end if;
    if new.status <> old.status and not (
      (old.status = 'pending' and new.status in ('accepted', 'declined')) or
      (old.status = 'submitted' and new.status in ('approved', 'accepted'))
    ) then
      raise exception 'Invalid status change';
    end if;
    if new.referral_code is distinct from old.referral_code then
      raise exception 'Referral codes are generated automatically';
    end if;
    if new.status = 'accepted' and old.referral_code is null then
      select upper(left(regexp_replace(c.display_name, '[^A-Za-z0-9]', '', 'g'), 10))
        into base from public.creator_profiles c where c.user_id = old.creator_id;
      new.referral_code := coalesce(nullif(base, ''), 'CREATOR') || '-' || upper(substr(md5(random()::text), 1, 4));
    end if;
  elsif is_creator then
    if new.sales_total <> old.sales_total or new.referral_code is distinct from old.referral_code then
      raise exception 'Only the brand can record sales';
    end if;
    if new.pitch is distinct from old.pitch and old.status <> 'pending' then
      raise exception 'Pitch can only change while pending';
    end if;
    if new.content_url is distinct from old.content_url and old.status not in ('accepted', 'submitted') then
      raise exception 'Content can be submitted once accepted';
    end if;
    if new.status <> old.status and not (old.status in ('accepted', 'submitted') and new.status = 'submitted') then
      raise exception 'Invalid status change';
    end if;
  else
    raise exception 'Not allowed';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_application_update on public.applications;
create trigger guard_application_update
  before update on public.applications
  for each row execute function public.guard_application_update();
