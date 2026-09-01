-- Run this migration in Supabase SQL Editor for an EXISTING project.
-- It fixes the recursive RLS policies, makes expense create/edit atomic,
-- and adds invite-code group joining.

create or replace function public.random_join_code() returns text language sql as $$
  select upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
$$;
alter table public.groups add column if not exists join_code text;
alter table public.groups alter column join_code set default public.random_join_code();
update public.groups set join_code=public.random_join_code() where join_code is null;
alter table public.groups alter column join_code set not null;
create unique index if not exists groups_join_code_key on public.groups(join_code);

create or replace function public.is_group_creator(gid uuid) returns boolean
language sql security definer set search_path=public
as $$
  select exists (select 1 from public.groups where id=gid and created_by=auth.uid());
$$;
grant execute on function public.is_group_creator(uuid) to authenticated;

create or replace function public.is_group_member(gid uuid) returns boolean
language sql security definer set search_path=public
as $$
  select exists (select 1 from public.groups g where g.id=gid and g.created_by=auth.uid())
      or exists (select 1 from public.group_members gm where gm.group_id=gid and gm.user_id=auth.uid());
$$;
grant execute on function public.is_group_member(uuid) to authenticated;

-- Remove old/recursive policies.
drop policy if exists "groups members read" on public.groups;
drop policy if exists "groups create" on public.groups;
drop policy if exists "groups update" on public.groups;
drop policy if exists "groups delete" on public.groups;
drop policy if exists "groups read" on public.groups;
drop policy if exists "group members read" on public.group_members;
drop policy if exists "group members manage by creator" on public.group_members;
drop policy if exists "group members insert" on public.group_members;
drop policy if exists "group members update" on public.group_members;
drop policy if exists "group members delete" on public.group_members;
drop policy if exists "expenses group access" on public.expenses;
drop policy if exists "expenses group select" on public.expenses;
drop policy if exists "expenses group insert" on public.expenses;
drop policy if exists "expenses group update" on public.expenses;
drop policy if exists "expenses group delete" on public.expenses;
drop policy if exists "expenses read" on public.expenses;
drop policy if exists "expenses insert" on public.expenses;
drop policy if exists "expenses update" on public.expenses;
drop policy if exists "expenses delete" on public.expenses;
drop policy if exists "shares group access" on public.expense_shares;
drop policy if exists "shares read" on public.expense_shares;
drop policy if exists "shares insert" on public.expense_shares;
drop policy if exists "shares update" on public.expense_shares;
drop policy if exists "shares delete" on public.expense_shares;
drop policy if exists "settlements group access" on public.settlements;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
alter table public.settlements enable row level security;

create policy "groups read" on public.groups for select to authenticated
using (public.is_group_member(id));
create policy "groups create" on public.groups for insert to authenticated
with check (created_by=auth.uid());
create policy "groups update" on public.groups for update to authenticated
using (public.is_group_creator(id)) with check (public.is_group_creator(id));
create policy "groups delete" on public.groups for delete to authenticated
using (public.is_group_creator(id));

create policy "group members read" on public.group_members for select to authenticated
using (public.is_group_member(group_id));
create policy "group members insert" on public.group_members for insert to authenticated
with check (public.is_group_creator(group_id));
create policy "group members update" on public.group_members for update to authenticated
using (public.is_group_creator(group_id)) with check (public.is_group_creator(group_id));
create policy "group members delete" on public.group_members for delete to authenticated
using (public.is_group_creator(group_id));

create policy "expenses read" on public.expenses for select to authenticated
using (public.is_group_member(group_id));
create policy "expenses insert" on public.expenses for insert to authenticated
with check (public.is_group_member(group_id));
create policy "expenses update" on public.expenses for update to authenticated
using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "expenses delete" on public.expenses for delete to authenticated
using (public.is_group_member(group_id));

create policy "shares read" on public.expense_shares for select to authenticated
using (exists (select 1 from public.expenses e where e.id=expense_id and public.is_group_member(e.group_id)));
create policy "shares insert" on public.expense_shares for insert to authenticated
with check (exists (select 1 from public.expenses e where e.id=expense_id and public.is_group_member(e.group_id)));
create policy "shares update" on public.expense_shares for update to authenticated
using (exists (select 1 from public.expenses e where e.id=expense_id and public.is_group_member(e.group_id)))
with check (exists (select 1 from public.expenses e where e.id=expense_id and public.is_group_member(e.group_id)));
create policy "shares delete" on public.expense_shares for delete to authenticated
using (exists (select 1 from public.expenses e where e.id=expense_id and public.is_group_member(e.group_id)));

create policy "settlements group access" on public.settlements for all to authenticated
using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

create or replace function public.create_expense_with_shares(
  p_group_id uuid,p_description text,p_total numeric,p_payer_id uuid,p_type expense_type,
  p_category text,p_method payment_method,p_date timestamptz,p_notes text,p_shares jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare eid uuid; sum_shares numeric;
begin
  if not public.is_group_member(p_group_id) then raise exception 'Not a group member'; end if;
  if p_total<=0 then raise exception 'Amount must be greater than zero'; end if;
  if not exists(select 1 from public.group_members where id=p_payer_id and group_id=p_group_id) then raise exception 'Invalid payer'; end if;
  select coalesce(sum((x->>'amount')::numeric),0) into sum_shares from jsonb_array_elements(p_shares) x;
  if round(sum_shares,2)<>round(p_total,2) then raise exception 'Shares must equal total'; end if;
  if exists(select 1 from jsonb_array_elements(p_shares) x where (x->>'amount')::numeric<0 or not exists(select 1 from public.group_members gm where gm.id=(x->>'member_id')::uuid and gm.group_id=p_group_id)) then raise exception 'Invalid share'; end if;
  insert into public.expenses(group_id,description,total_amount,payer_id,expense_type,category,payment_method,date,notes)
  values(p_group_id,p_description,p_total,p_payer_id,p_type,p_category,p_method,coalesce(p_date,now()),p_notes) returning id into eid;
  insert into public.expense_shares(expense_id,member_id,amount)
  select eid,(x->>'member_id')::uuid,(x->>'amount')::numeric from jsonb_array_elements(p_shares) x;
  return eid;
end;$$;
grant execute on function public.create_expense_with_shares(uuid,text,numeric,uuid,expense_type,text,payment_method,timestamptz,text,jsonb) to authenticated;

create or replace function public.update_expense_with_shares(
  p_expense_id uuid,p_group_id uuid,p_description text,p_total numeric,p_payer_id uuid,p_type expense_type,
  p_category text,p_method payment_method,p_date timestamptz,p_notes text,p_shares jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare sum_shares numeric; actual_group uuid;
begin
  if not public.is_group_member(p_group_id) then raise exception 'Not a group member'; end if;
  select group_id into actual_group from public.expenses where id=p_expense_id;
  if actual_group is null or actual_group<>p_group_id then raise exception 'Expense not found'; end if;
  if p_total<=0 then raise exception 'Amount must be greater than zero'; end if;
  if not exists(select 1 from public.group_members where id=p_payer_id and group_id=p_group_id) then raise exception 'Invalid payer'; end if;
  select coalesce(sum((x->>'amount')::numeric),0) into sum_shares from jsonb_array_elements(p_shares) x;
  if round(sum_shares,2)<>round(p_total,2) then raise exception 'Shares must equal total'; end if;
  if exists(select 1 from jsonb_array_elements(p_shares) x where (x->>'amount')::numeric<0 or not exists(select 1 from public.group_members gm where gm.id=(x->>'member_id')::uuid and gm.group_id=p_group_id)) then raise exception 'Invalid share'; end if;
  update public.expenses set description=p_description,total_amount=p_total,payer_id=p_payer_id,expense_type=p_type,category=p_category,payment_method=p_method,date=coalesce(p_date,now()),notes=p_notes where id=p_expense_id;
  delete from public.expense_shares where expense_id=p_expense_id;
  insert into public.expense_shares(expense_id,member_id,amount)
  select p_expense_id,(x->>'member_id')::uuid,(x->>'amount')::numeric from jsonb_array_elements(p_shares) x;
end;$$;
grant execute on function public.update_expense_with_shares(uuid,uuid,text,numeric,uuid,expense_type,text,payment_method,timestamptz,text,jsonb) to authenticated;

create or replace function public.group_preview_by_code(p_code text)
returns table(group_id uuid, group_name text, unlinked_members jsonb)
language plpgsql security definer set search_path=public as $$
declare gid uuid; gname text;
begin
  select id,name into gid,gname from public.groups where join_code = upper(trim(p_code));
  if gid is null then raise exception 'Invalid invite code.'; end if;
  return query select gid, gname,
    coalesce((select jsonb_agg(jsonb_build_object('id',id,'display_name',display_name) order by display_name)
              from public.group_members where group_id=gid and user_id is null),'[]'::jsonb);
end;$$;
grant execute on function public.group_preview_by_code(text) to authenticated;

create or replace function public.claim_group_member(p_code text,p_member_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare gid uuid; mgid uuid; muid uuid;
begin
  select id into gid from public.groups where join_code = upper(trim(p_code));
  if gid is null then raise exception 'Invalid invite code.'; end if;
  select group_id,user_id into mgid,muid from public.group_members where id=p_member_id;
  if mgid is null or mgid<>gid then raise exception 'That member does not belong to this group.'; end if;
  if muid is not null then raise exception 'That member is already linked to an account.'; end if;
  if exists(select 1 from public.group_members where group_id=gid and user_id=auth.uid()) then raise exception 'You are already a member of this group.'; end if;
  update public.group_members set user_id=auth.uid() where id=p_member_id;
  return p_member_id;
end;$$;
grant execute on function public.claim_group_member(text,uuid) to authenticated;

create or replace function public.join_group_with_code(p_code text) returns uuid
language plpgsql security definer set search_path=public as $$
declare gid uuid; member_id uuid; display text;
begin
  select id into gid from public.groups where join_code = upper(trim(p_code));
  if gid is null then raise exception 'Invalid invite code.'; end if;
  select id into member_id from public.group_members where group_id=gid and user_id=auth.uid();
  if member_id is not null then return member_id; end if;
  select coalesce(raw_user_meta_data->>'name',split_part(email,'@',1)) into display from auth.users where id=auth.uid();
  insert into public.group_members(group_id,user_id,display_name) values(gid,auth.uid(),coalesce(display,'Member')) returning id into member_id;
  return member_id;
end;$$;
grant execute on function public.join_group_with_code(text) to authenticated;

create or replace function public.leave_group(p_group_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare mid uuid; is_creator boolean;
begin
  select public.is_group_creator(p_group_id) into is_creator;
  if is_creator then raise exception 'The group creator cannot leave. Delete the group instead.'; end if;
  select id into mid from public.group_members where group_id=p_group_id and user_id=auth.uid();
  if mid is null then raise exception 'You are not a member of this group.'; end if;
  delete from public.group_members where id=mid;
end;$$;
grant execute on function public.leave_group(uuid) to authenticated;

-- Diagnostic: any rows returned here are orphaned expenses left by an earlier failed two-step insert.
-- Review before deleting them:
-- select e.id,e.description,e.total_amount from public.expenses e
-- where not exists(select 1 from public.expense_shares s where s.expense_id=e.id);
