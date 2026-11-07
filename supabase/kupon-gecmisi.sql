-- Tahsil edilen kupon silinmez, collected_at ile arşivlenir.
-- Sürpriz kilidi sunucu saatine bakar. İlerleme yedeği earned geriye gitmeyecek şekilde tutulur.
alter table public.coupons
  add column cost integer,
  add column collected_at timestamptz;

create table private.progress (
  id integer primary key default 1 check (id = 1),
  data jsonb not null,
  earned integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.surprise_open()
returns boolean language sql security definer set search_path = '' as $$
  select pg_catalog.now() >= timestamptz '2026-11-21 08:00:00+03';
$$;

create or replace function public.add_coupon(p_id uuid, p_item text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_cost integer;
begin
  case p_item
    when 'hug' then v_name := 'Sarılma'; v_cost := 1;
    when 'bighug' then v_name := 'Kocaman sarılma'; v_cost := 5;
    when 'kiss' then v_name := 'Öpücük'; v_cost := 10;
    when 'bigkiss' then v_name := 'Büyük öpücük'; v_cost := 20;
    when 'bomb' then v_name := 'Öpücük bombası'; v_cost := 40;
    when 'surprise' then v_name := 'Sürpriz'; v_cost := 567;
    else raise exception 'bilinmeyen ürün';
  end case;
  if p_item = 'surprise' and not public.surprise_open() then
    raise exception 'sürpriz henüz açılmadı';
  end if;
  if (select count(*) from public.coupons) >= 2000 then
    raise exception 'kupon sınırı doldu';
  end if;
  insert into public.coupons (id, item, name, cost) values (p_id, p_item, v_name, v_cost)
  on conflict (id) do nothing;
end $$;

create or replace function public.open_coupons(p_ids uuid[])
returns setof uuid language sql security definer set search_path = '' as $$
  select id from public.coupons where id = any (p_ids) and collected_at is null;
$$;

drop function public.admin_coupons(text);
create function public.admin_coupons(p_secret text)
returns setof public.coupons language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_secret) then
    raise exception 'yetkisiz';
  end if;
  return query select * from public.coupons where collected_at is null order by bought_at desc;
end $$;

create or replace function public.admin_collect(p_secret text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_secret) then
    raise exception 'yetkisiz';
  end if;
  update public.coupons set collected_at = pg_catalog.now() where id = p_id and collected_at is null;
end $$;

create function public.save_progress(p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_earned integer := coalesce((p_data ->> 'earned')::integer, 0);
begin
  if pg_catalog.jsonb_typeof(p_data) <> 'object' or pg_catalog.octet_length(p_data::text) > 60000 then
    raise exception 'geçersiz kayıt';
  end if;
  insert into private.progress (id, data, earned) values (1, p_data, v_earned)
  on conflict (id) do update
    set data = excluded.data, earned = excluded.earned, updated_at = pg_catalog.now()
    where private.progress.earned <= excluded.earned;
end $$;

create function public.load_progress()
returns jsonb language sql security definer set search_path = '' as $$
  select data from private.progress where id = 1;
$$;

revoke all on function public.surprise_open() from public, authenticated;
revoke all on function public.admin_coupons(text) from public, authenticated;
revoke all on function public.save_progress(jsonb) from public, authenticated;
revoke all on function public.load_progress() from public, authenticated;
grant execute on function public.surprise_open() to anon;
grant execute on function public.admin_coupons(text) to anon;
grant execute on function public.save_progress(jsonb) to anon;
grant execute on function public.load_progress() to anon;
