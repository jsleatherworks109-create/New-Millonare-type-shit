-- Makes an existing account an admin with full, free access to every plan.
-- 1. Create the account first: Supabase dashboard → Authentication → Users → Add user
--    (tick "Auto Confirm User" and choose the password there, never in code).
-- 2. Run this in the SQL Editor. Change the email below if you use a different one.

insert into public.profiles (id, email, plan, is_admin)
select id, email, 'scale', true from auth.users where email = 'adminpod@admin.com'
on conflict (id) do update set plan = 'scale', is_admin = true;

select id, email, plan, is_admin from public.profiles where email = 'adminpod@admin.com';
