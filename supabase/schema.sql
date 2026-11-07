-- Tablo dışarıya kapalı. Site ve masaüstü uygulaması yalnızca aşağıdaki fonksiyonlara erişir.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.admin_secret (hash bytea not null);

create table public.coupons (
  id uuid primary key,
  item text not null,
  name text not null,
  bought_at timestamptz not null default now()
);
alter table public.coupons enable row level security;
revoke all on public.coupons from public, anon, authenticated;

create function public.add_coupon(p_id uuid, p_item text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text := case p_item
    when 'hug' then 'Sarılma'
    when 'bighug' then 'Kocaman sarılma'
    when 'kiss' then 'Öpücük'
    when 'bigkiss' then 'Büyük öpücük'
    when 'bomb' then 'Öpücük bombası'
    when 'surprise' then 'Sürpriz'
  end;
begin
  if v_name is null then
    raise exception 'bilinmeyen ürün';
  end if;
  if (select count(*) from public.coupons) >= 500 then
    raise exception 'kupon sınırı doldu';
  end if;
  insert into public.coupons (id, item, name) values (p_id, p_item, v_name)
  on conflict (id) do nothing;
end $$;

create function public.open_coupons(p_ids uuid[])
returns setof uuid language sql security definer set search_path = '' as $$
  select id from public.coupons where id = any (p_ids);
$$;

create function private.is_admin(p_secret text)
returns boolean language sql security definer set search_path = '' as $$
  select exists (
    select 1 from private.admin_secret
    where hash = pg_catalog.sha256(pg_catalog.convert_to(p_secret, 'UTF8'))
  );
$$;

create function public.admin_coupons(p_secret text)
returns setof public.coupons language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_secret) then
    raise exception 'yetkisiz';
  end if;
  return query select * from public.coupons order by bought_at desc;
end $$;

create function public.admin_collect(p_secret text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_secret) then
    raise exception 'yetkisiz';
  end if;
  delete from public.coupons where id = p_id;
end $$;

create function public.ping()
returns boolean language sql security definer set search_path = '' as $$
  select true;
$$;

revoke all on all functions in schema public from public, authenticated;
revoke all on function private.is_admin(text) from public, anon, authenticated;
grant usage on schema public to anon;
grant execute on function public.add_coupon(uuid, text) to anon;
grant execute on function public.open_coupons(uuid[]) to anon;
grant execute on function public.admin_coupons(text) to anon;
grant execute on function public.admin_collect(text, uuid) to anon;
grant execute on function public.ping() to anon;
