-- Beskid Floor Panel – schemat bazy.
-- Dane aplikacji leżą w jednej tabeli `rekordy` (jeden wiersz = jeden rekord: zlecenie, koszt, wpis godzin...).
-- Klient NIE ma bezpośredniego dostępu do zapisu: wszystko przechodzi przez funkcje sync_push / sync_pull,
-- które scalają zmiany pole po polu i okrajają dane zgodnie z uprawnieniami Wspólnika.

create table if not exists public.organizacje (
  id uuid primary key default gen_random_uuid(),
  nazwa text not null,
  utworzono timestamptz not null default now()
);

create table if not exists public.czlonkowie (
  org_id uuid not null references public.organizacje (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rola text not null check (rola in ('wlasciciel', 'wspolnik')),
  email text,
  primary key (org_id, user_id),
  unique (user_id),
  unique (org_id, rola)
);

create table if not exists public.zaproszenia (
  org_id uuid not null references public.organizacje (id) on delete cascade,
  email text not null,
  utworzono timestamptz not null default now(),
  primary key (org_id, email)
);

create sequence if not exists public.rekordy_wersja;

create table if not exists public.rekordy (
  org_id uuid not null references public.organizacje (id) on delete cascade,
  tabela text not null,
  id text not null,
  dane jsonb not null default '{}'::jsonb,
  -- znacznik czasu ostatniej zmiany każdego pola: {"netto": 1767225600000, ...}
  pola_ts jsonb not null default '{}'::jsonb,
  wersja bigint not null default nextval('public.rekordy_wersja'),
  zmienil uuid,
  zmieniono timestamptz not null default now(),
  primary key (org_id, tabela, id)
);
create index if not exists rekordy_org_wersja on public.rekordy (org_id, wersja);

alter table public.organizacje enable row level security;
alter table public.czlonkowie enable row level security;
alter table public.zaproszenia enable row level security;
alter table public.rekordy enable row level security;

-- ---------- funkcje pomocnicze ----------
create or replace function public.bf_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.czlonkowie where user_id = auth.uid()
$$;

create or replace function public.bf_rola() returns text
language sql stable security definer set search_path = public as $$
  select rola from public.czlonkowie where user_id = auth.uid()
$$;

create or replace function public.bf_uprawnienia(p_org uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select dane -> 'uprawnienia' from public.rekordy where org_id = p_org and tabela = 'ustawienia' and id = 'glowne'),
    '{}'::jsonb)
$$;

-- wartość uprawnienia (domyślnie: tylko „materialy” włączone)
create or replace function public.bf_upr(p_upr jsonb, p_klucz text) returns boolean
language sql immutable as $$
  select coalesce((p_upr ->> p_klucz)::boolean, p_klucz = 'materialy')
$$;

-- ---------- RLS: odczyt bezpośredni tylko dla Właściciela ----------
drop policy if exists organizacje_odczyt on public.organizacje;
create policy organizacje_odczyt on public.organizacje for select to authenticated using (id = public.bf_org());

drop policy if exists czlonkowie_odczyt on public.czlonkowie;
create policy czlonkowie_odczyt on public.czlonkowie for select to authenticated using (org_id = public.bf_org());

drop policy if exists zaproszenia_odczyt on public.zaproszenia;
create policy zaproszenia_odczyt on public.zaproszenia for select to authenticated
  using (org_id = public.bf_org() and public.bf_rola() = 'wlasciciel');

drop policy if exists rekordy_odczyt_wlasciciel on public.rekordy;
create policy rekordy_odczyt_wlasciciel on public.rekordy for select to authenticated
  using (org_id = public.bf_org() and public.bf_rola() = 'wlasciciel');
-- brak polityk insert/update/delete: zapis wyłącznie przez sync_push (security definer)

-- ---------- konta ----------
create or replace function public.moja_org() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('org_id', c.org_id, 'rola', c.rola, 'nazwa', o.nazwa, 'email', c.email)
  from public.czlonkowie c join public.organizacje o on o.id = c.org_id
  where c.user_id = auth.uid()
$$;

create or replace function public.utworz_organizacje(p_nazwa text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Brak zalogowanego użytkownika'; end if;
  if public.bf_org() is not null then return public.moja_org(); end if;
  insert into public.organizacje (nazwa) values (coalesce(nullif(trim(p_nazwa), ''), 'Moja firma')) returning id into v_org;
  insert into public.czlonkowie (org_id, user_id, rola, email) values (v_org, auth.uid(), 'wlasciciel', lower(auth.jwt() ->> 'email'));
  return public.moja_org();
end $$;

create or replace function public.zapros_wspolnika(p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.bf_rola() is distinct from 'wlasciciel' then raise exception 'Tylko właściciel może zapraszać'; end if;
  if p_email is null or position('@' in p_email) = 0 then raise exception 'Niepoprawny adres e-mail'; end if;
  insert into public.zaproszenia (org_id, email) values (public.bf_org(), lower(trim(p_email))) on conflict do nothing;
end $$;

create or replace function public.przyjmij_zaproszenie() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(auth.jwt() ->> 'email'); v_org uuid;
begin
  if auth.uid() is null then raise exception 'Brak zalogowanego użytkownika'; end if;
  if public.bf_org() is not null then return public.moja_org(); end if;
  select z.org_id into v_org from public.zaproszenia z
   where z.email = v_email
     and not exists (select 1 from public.czlonkowie c where c.org_id = z.org_id and c.rola = 'wspolnik')
   order by z.utworzono limit 1;
  if v_org is null then return null; end if;
  insert into public.czlonkowie (org_id, user_id, rola, email) values (v_org, auth.uid(), 'wspolnik', v_email);
  delete from public.zaproszenia where org_id = v_org and email = v_email;
  return public.moja_org();
end $$;

create or replace function public.lista_czlonkow() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'czlonkowie', coalesce((select jsonb_agg(jsonb_build_object('email', email, 'rola', rola) order by rola) from public.czlonkowie where org_id = public.bf_org()), '[]'::jsonb),
    'zaproszenia', case when public.bf_rola() = 'wlasciciel'
      then coalesce((select jsonb_agg(email) from public.zaproszenia where org_id = public.bf_org()), '[]'::jsonb)
      else '[]'::jsonb end)
$$;

create or replace function public.usun_wspolnika() returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.bf_rola() is distinct from 'wlasciciel' then raise exception 'Tylko właściciel może usuwać dostęp'; end if;
  delete from public.czlonkowie where org_id = public.bf_org() and rola = 'wspolnik';
  delete from public.zaproszenia where org_id = public.bf_org();
end $$;

-- ---------- co widzi Wspólnik (odpowiednik src/lib/uprawnienia.ts) ----------
create or replace function public.bf_widok_wspolnika(p_org uuid, p_tabela text, p_dane jsonb, p_upr jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_moje boolean := (p_dane ->> 'utworzyl') = 'wspolnik';
  v_pola text[];
begin
  case p_tabela
    when 'ustawienia' then
      v_pola := array['firma', 'ludzie', 'uprawnienia', 'dojazd', 'zuzycie', 'stawka', 'vatKosztow', 'utworzono', 'utworzyl'];
      if public.bf_upr(p_upr, 'oferty') or public.bf_upr(p_upr, 'dokumenty') then
        v_pola := v_pola || array['cennik', 'szablony', 'vatOfert', 'vatZlecen', 'zaliczka', 'waznosc'];
      end if;
      if public.bf_upr(p_upr, 'rozliczenie') then v_pola := v_pola || array['udzial']; end if;
      return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(p_dane) where key = any (v_pola));
    when 'zlecenia' then
      if not (public.bf_upr(p_upr, 'wszystkieZlecenia') or coalesce(p_dane -> 'ekipa', '[]'::jsonb) ? 'wspolnik') then return null; end if;
      if public.bf_upr(p_upr, 'kwoty') then return p_dane; end if;
      return p_dane - array['netto', 'brutto', 'cenaM2', 'vat', 'udzial'];
    when 'godziny' then
      if public.bf_upr(p_upr, 'wszystkieGodziny') or (p_dane ->> 'osoba') = 'wspolnik' then return p_dane; end if;
    when 'koszty' then
      if public.bf_upr(p_upr, 'koszty') or v_moje then return p_dane; end if;
    when 'wyplaty' then
      if public.bf_upr(p_upr, 'rozliczenie') or (p_dane ->> 'osoba') = 'wspolnik' then return p_dane; end if;
    when 'klienci', 'zapytania' then
      if public.bf_upr(p_upr, 'klienci') then return p_dane; end if;
    when 'oferty' then
      if public.bf_upr(p_upr, 'oferty') then return p_dane; end if;
    when 'materialy', 'ruchy' then
      if public.bf_upr(p_upr, 'materialy') then return p_dane; end if;
    when 'zadania' then
      return p_dane;
    when 'dokumenty' then
      if public.bf_upr(p_upr, 'dokumenty') then return p_dane; end if;
    when 'pliki' then
      if v_moje then return p_dane; end if;
      if (p_dane ->> 'rodzaj') = 'paragon' then
        if public.bf_upr(p_upr, 'koszty') then return p_dane; end if;
      elsif (p_dane ->> 'zlecenieId') is not null and exists (
        select 1 from public.rekordy z
         where z.org_id = p_org and z.tabela = 'zlecenia' and z.id = p_dane ->> 'zlecenieId'
           and (public.bf_upr(p_upr, 'wszystkieZlecenia') or coalesce(z.dane -> 'ekipa', '[]'::jsonb) ? 'wspolnik')) then
        return p_dane;
      end if;
    when 'historia' then
      if (p_dane ->> 'kto') = 'wspolnik' then return p_dane; end if;
    else
      return null;
  end case;
  return null;
end $$;

-- ---------- wysyłanie zmian: scalanie pole po polu ----------
-- p_rekordy: [{"tabela": "zlecenia", "id": "...", "dane": {...}, "pola_ts": {"pole": 1767225600000}}]
-- Dla każdego pola wygrywa nowszy znacznik czasu, więc równoczesne zmiany różnych pól nie nadpisują się.
create or replace function public.sync_push(p_rekordy jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.bf_org();
  v_rola text := public.bf_rola();
  v_upr jsonb;
  v_r jsonb;
  v_tabela text;
  v_id text;
  v_nowe jsonb;
  v_stare public.rekordy%rowtype;
  v_jest boolean;
  v_dane jsonb;
  v_pola jsonb;
  v_pole text;
  v_ts bigint;
  v_zmiana boolean;
  v_dozwolone text[];
  v_powod text;
  v_przyjete int := 0;
  v_odrzucone jsonb := '[]'::jsonb;
begin
  if v_org is null then raise exception 'Konto nie należy do żadnej firmy'; end if;
  if jsonb_typeof(p_rekordy) <> 'array' or jsonb_array_length(p_rekordy) > 500 then
    raise exception 'Niepoprawna paczka zmian (maksymalnie 500 rekordów)';
  end if;
  -- zapisy jednej firmy wykonują się po kolei, dzięki czemu numery wersji rosną w kolejności zatwierdzania
  perform pg_advisory_xact_lock(hashtextextended(v_org::text, 0));
  v_upr := public.bf_uprawnienia(v_org);

  for v_r in select * from jsonb_array_elements(p_rekordy) loop
    v_tabela := v_r ->> 'tabela';
    v_id := v_r ->> 'id';
    v_nowe := coalesce(v_r -> 'dane', '{}'::jsonb);
    v_powod := null;
    v_dozwolone := null;

    if v_id is null or v_tabela is null or not (v_tabela = any (array['ustawienia', 'klienci', 'zapytania', 'oferty', 'zlecenia',
        'koszty', 'godziny', 'wyplaty', 'materialy', 'ruchy', 'zadania', 'dokumenty', 'pliki', 'historia'])) then
      v_odrzucone := v_odrzucone || jsonb_build_object('tabela', v_tabela, 'id', v_id, 'powod', 'nieznana tabela');
      continue;
    end if;

    select * into v_stare from public.rekordy where org_id = v_org and tabela = v_tabela and id = v_id;
    v_jest := found;

    if v_rola = 'wspolnik' then
      if not v_jest then v_nowe := v_nowe || '{"utworzyl": "wspolnik"}'::jsonb; end if;
      case v_tabela
        when 'godziny' then
          if (v_jest and (v_stare.dane ->> 'osoba') is distinct from 'wspolnik')
             or (v_nowe ? 'osoba' and (v_nowe ->> 'osoba') is distinct from 'wspolnik')
             or (not v_jest and not v_nowe ? 'osoba') then
            v_powod := 'można zapisywać tylko własne godziny';
          end if;
        when 'zadania' then null;
        when 'koszty' then
          if v_jest and not public.bf_upr(v_upr, 'koszty') and (v_stare.dane ->> 'utworzyl') is distinct from 'wspolnik' then
            v_powod := 'brak uprawnień do tego kosztu';
          end if;
        when 'pliki' then
          if v_jest and (v_stare.dane ->> 'utworzyl') is distinct from 'wspolnik' then v_powod := 'brak uprawnień do tego pliku'; end if;
        when 'historia' then
          if v_jest or (v_nowe ->> 'kto') is distinct from 'wspolnik' then v_powod := 'historia jest tylko do odczytu'; end if;
        when 'zlecenia' then
          if not v_jest or public.bf_widok_wspolnika(v_org, 'zlecenia', v_stare.dane, v_upr) is null then
            v_powod := 'brak dostępu do zlecenia';
          else
            v_dozwolone := array['notatki', 'status', 'listaZakupow', 'zmienil'];
          end if;
        when 'materialy', 'ruchy' then
          if not public.bf_upr(v_upr, 'materialy') then v_powod := 'brak uprawnień: materiały'; end if;
        when 'klienci', 'zapytania' then
          if not public.bf_upr(v_upr, 'klienci') then v_powod := 'brak uprawnień: klienci'; end if;
        when 'oferty' then
          if not public.bf_upr(v_upr, 'oferty') then v_powod := 'brak uprawnień: oferty'; end if;
        when 'dokumenty' then
          if not public.bf_upr(v_upr, 'dokumenty') then v_powod := 'brak uprawnień: dokumenty'; end if;
        else
          v_powod := 'tylko właściciel może zmieniać te dane';
      end case;
    end if;

    if v_powod is not null then
      v_odrzucone := v_odrzucone || jsonb_build_object('tabela', v_tabela, 'id', v_id, 'powod', v_powod);
      continue;
    end if;

    v_dane := case when v_jest then v_stare.dane else '{}'::jsonb end;
    v_pola := case when v_jest then v_stare.pola_ts else '{}'::jsonb end;
    v_zmiana := false;
    for v_pole, v_ts in select key, (value #>> '{}')::bigint from jsonb_each(coalesce(v_r -> 'pola_ts', '{}'::jsonb)) loop
      if v_dozwolone is not null and not (v_pole = any (v_dozwolone)) then continue; end if;
      if v_ts > coalesce((v_pola ->> v_pole)::bigint, -1) then
        v_dane := v_dane || jsonb_build_object(v_pole, coalesce(v_nowe -> v_pole, 'null'::jsonb));
        v_pola := v_pola || jsonb_build_object(v_pole, v_ts);
        v_zmiana := true;
      end if;
    end loop;

    if v_zmiana then
      insert into public.rekordy (org_id, tabela, id, dane, pola_ts, zmienil)
      values (v_org, v_tabela, v_id, v_dane, v_pola, auth.uid())
      on conflict (org_id, tabela, id) do update
        set dane = excluded.dane, pola_ts = excluded.pola_ts, wersja = nextval('public.rekordy_wersja'),
            zmienil = excluded.zmienil, zmieniono = now();
    end if;
    v_przyjete := v_przyjete + 1;
  end loop;

  return jsonb_build_object('przyjete', v_przyjete, 'odrzucone', v_odrzucone);
end $$;

-- ---------- pobieranie zmian ----------
-- Zwraca rekordy o wersji > p_od. Wspólnik dostaje dane okrojone; rekordy, do których nie ma dostępu,
-- przychodzą jako {"_ukryty": true}, żeby aplikacja usunęła je z pamięci urządzenia.
create or replace function public.sync_pull(p_od bigint default 0, p_limit int default 500)
returns table (tabela text, id text, dane jsonb, pola_ts jsonb, wersja bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid := public.bf_org();
  v_rola text := public.bf_rola();
  v_upr jsonb;
  v_w record;
  v_widok jsonb;
begin
  if v_org is null then raise exception 'Konto nie należy do żadnej firmy'; end if;
  if v_rola = 'wlasciciel' then
    return query select r.tabela, r.id, r.dane, r.pola_ts, r.wersja from public.rekordy r
      where r.org_id = v_org and r.wersja > p_od order by r.wersja limit least(greatest(p_limit, 1), 1000);
    return;
  end if;
  v_upr := public.bf_uprawnienia(v_org);
  for v_w in select r.* from public.rekordy r where r.org_id = v_org and r.wersja > p_od
             order by r.wersja limit least(greatest(p_limit, 1), 1000) loop
    v_widok := public.bf_widok_wspolnika(v_org, v_w.tabela, v_w.dane, v_upr);
    tabela := v_w.tabela; id := v_w.id; wersja := v_w.wersja;
    if v_widok is null then
      dane := '{"_ukryty": true}'::jsonb; pola_ts := '{}'::jsonb;
    else
      dane := v_widok; pola_ts := v_w.pola_ts;
    end if;
    return next;
  end loop;
end $$;

-- ---------- RODO: trwałe usunięcie wszystkich danych firmy (tylko Właściciel) ----------
create or replace function public.usun_wszystkie_dane() returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.bf_rola() is distinct from 'wlasciciel' then raise exception 'Tylko właściciel może usunąć dane'; end if;
  delete from public.rekordy where org_id = public.bf_org();
end $$;

-- ---------- uprawnienia do wywołań ----------
revoke all on function public.sync_push(jsonb), public.sync_pull(bigint, int), public.moja_org(), public.utworz_organizacje(text),
  public.zapros_wspolnika(text), public.przyjmij_zaproszenie(), public.lista_czlonkow(), public.usun_wspolnika(),
  public.usun_wszystkie_dane(), public.bf_uprawnienia(uuid), public.bf_widok_wspolnika(uuid, text, jsonb, jsonb) from public;
grant execute on function public.sync_push(jsonb), public.sync_pull(bigint, int), public.moja_org(), public.utworz_organizacje(text),
  public.zapros_wspolnika(text), public.przyjmij_zaproszenie(), public.lista_czlonkow(), public.usun_wspolnika(),
  public.usun_wszystkie_dane(), public.bf_org(), public.bf_rola() to authenticated;
revoke all on public.rekordy, public.czlonkowie, public.zaproszenia, public.organizacje from anon;
grant select on public.rekordy, public.czlonkowie, public.zaproszenia, public.organizacje to authenticated;
