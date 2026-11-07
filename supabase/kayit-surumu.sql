-- save_progress yalnızca 2. sürüm kaydı kabul eder, eski sekmeler sıfırlanan veriyi geri yazamaz.
create or replace function public.save_progress(p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_earned integer := coalesce((p_data ->> 'earned')::integer, 0);
begin
  if pg_catalog.jsonb_typeof(p_data) <> 'object' or pg_catalog.octet_length(p_data::text) > 60000 then
    raise exception 'geçersiz kayıt';
  end if;
  if (p_data ->> 'v') is distinct from '2' then
    return;
  end if;
  insert into private.progress (id, data, earned) values (1, p_data, v_earned)
  on conflict (id) do update
    set data = excluded.data, earned = excluded.earned, updated_at = pg_catalog.now()
    where private.progress.earned <= excluded.earned;
end $$;
