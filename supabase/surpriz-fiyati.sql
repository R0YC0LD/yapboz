-- Sürprizin fiyatı artık siteden gelir: bütün kutuların parça toplamı.
-- add_coupon(p_id, p_item, p_cost) eklendi. Eski iki parametreli sürüm eski sekmeler için duruyor.
create function public.add_coupon(p_id uuid, p_item text, p_cost integer)
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
    when 'surprise' then v_name := 'Sürpriz'; v_cost := least(greatest(coalesce(p_cost, 0), 1), 100000);
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

revoke all on function public.add_coupon(uuid, text, integer) from public, authenticated;
grant execute on function public.add_coupon(uuid, text, integer) to anon;
