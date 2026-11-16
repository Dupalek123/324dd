-- Magazyn plików (zdjęcia z budowy, paragony, kopie zapasowe).
-- Ścieżka obiektu: {org_id}/{rodzaj}/{id}, gdzie rodzaj ∈ zdjecie | paragon | dokument | kopie.

insert into storage.buckets (id, name, public) values ('pliki', 'pliki', false) on conflict (id) do nothing;

create or replace function public.bf_dostep_do_pliku(p_nazwa text, p_wlasciciel text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_czesci text[] := string_to_array(p_nazwa, '/');
  v_rola text := public.bf_rola();
begin
  if v_rola is null or v_czesci[1] is distinct from public.bf_org()::text then return false; end if;
  if v_rola = 'wlasciciel' then return true; end if;
  if p_wlasciciel = auth.uid()::text then return true; end if;
  if v_czesci[2] in ('zdjecie', 'dokument') then return true; end if;
  if v_czesci[2] = 'paragon' then return public.bf_upr(public.bf_uprawnienia(public.bf_org()), 'koszty'); end if;
  return false; -- kopie zapasowe: tylko Właściciel
end $$;

drop policy if exists pliki_odczyt on storage.objects;
create policy pliki_odczyt on storage.objects for select to authenticated
  using (bucket_id = 'pliki' and public.bf_dostep_do_pliku(name, owner_id));

drop policy if exists pliki_dodawanie on storage.objects;
create policy pliki_dodawanie on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pliki'
    and (string_to_array(name, '/'))[1] = public.bf_org()::text
    and (public.bf_rola() = 'wlasciciel' or (string_to_array(name, '/'))[2] in ('zdjecie', 'paragon', 'dokument'))
  );

drop policy if exists pliki_zmiana on storage.objects;
create policy pliki_zmiana on storage.objects for update to authenticated
  using (bucket_id = 'pliki' and (string_to_array(name, '/'))[1] = public.bf_org()::text
         and (public.bf_rola() = 'wlasciciel' or owner_id = auth.uid()::text));

drop policy if exists pliki_usuwanie on storage.objects;
create policy pliki_usuwanie on storage.objects for delete to authenticated
  using (bucket_id = 'pliki' and (string_to_array(name, '/'))[1] = public.bf_org()::text
         and (public.bf_rola() = 'wlasciciel' or owner_id = auth.uid()::text));
