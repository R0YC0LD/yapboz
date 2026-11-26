-- Ortak yapılacaklar listesi. Madde metni sitede parolayla şifrelenir, veritabanı yalnızca şifreli metni görür.
create table private.todos (
  id uuid primary key,
  sealed text not null check (pg_catalog.length(sealed) <= 4000),
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create function public.todo_list()
returns table (id uuid, sealed text, done_at timestamptz, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select t.id, t.sealed, t.done_at, t.created_at from private.todos t order by t.created_at;
$$;

create function public.todo_add(p_id uuid, p_sealed text, p_created timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from private.todos) >= 500 then
    raise exception 'liste dolu';
  end if;
  insert into private.todos (id, sealed, created_at)
  values (p_id, p_sealed, least(coalesce(p_created, pg_catalog.now()), pg_catalog.now()))
  on conflict (id) do nothing;
end $$;

create function public.todo_mark(p_id uuid, p_done boolean)
returns void language sql security definer set search_path = '' as $$
  update private.todos
  set done_at = case when p_done then coalesce(done_at, pg_catalog.now()) end
  where id = p_id;
$$;

create function public.todo_remove(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from private.todos where id = p_id;
$$;

revoke all on function public.todo_list() from public, authenticated;
revoke all on function public.todo_add(uuid, text, timestamptz) from public, authenticated;
revoke all on function public.todo_mark(uuid, boolean) from public, authenticated;
revoke all on function public.todo_remove(uuid) from public, authenticated;
grant execute on function public.todo_list() to anon;
grant execute on function public.todo_add(uuid, text, timestamptz) to anon;
grant execute on function public.todo_mark(uuid, boolean) to anon;
grant execute on function public.todo_remove(uuid) to anon;
