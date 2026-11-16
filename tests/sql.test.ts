// Testy funkcji SQL na prawdziwym Postgresie (pglite, WASM): scalanie pole po polu i uprawnienia Wspólnika.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const WL = '00000000-0000-0000-0000-000000000001';
const WS = '00000000-0000-0000-0000-000000000002';
const OBCY = '00000000-0000-0000-0000-000000000003';
let pg: PGlite;

async function jako<T = any>(uid: string, email: string, sql: string, parametry: unknown[] = []): Promise<T[]> {
  await pg.query(`select set_config('test.uid', $1, false), set_config('test.email', $2, false)`, [uid, email]);
  return (await pg.query<T>(sql, parametry)).rows;
}
const push = async (uid: string, rekordy: unknown[]) => (await jako(uid, '', 'select public.sync_push($1::jsonb) as w', [JSON.stringify(rekordy)]))[0].w;
const pull = (uid: string, od = 0) => jako<{ tabela: string; id: string; dane: any; pola_ts: any; wersja: string }>(uid, '', 'select * from public.sync_pull($1)', [od]);
const rek = (tabela: string, id: string, dane: Record<string, unknown>, ts: number) =>
  ({ tabela, id, dane, pola_ts: Object.fromEntries(Object.keys(dane).map((k) => [k, ts])) });

beforeAll(async () => {
  pg = new PGlite();
  // atrapa środowiska Supabase: schemat auth i rola authenticated
  await pg.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('test.email', true)) $$;
    insert into auth.users values ('${WL}'), ('${WS}'), ('${OBCY}');
  `);
  await pg.exec(readFileSync('supabase/migrations/0001_schemat.sql', 'utf8'));
  await jako(WL, 'janek@example.com', `select public.utworz_organizacje('Beskid Floor')`);
  await jako(WL, 'janek@example.com', `select public.zapros_wspolnika('Kuba@Example.com')`);
  await jako(WS, 'kuba@example.com', `select public.przyjmij_zaproszenie()`);
});

describe('konta i zaproszenia', () => {
  it('właściciel i wspólnik należą do tej samej firmy', async () => {
    const a = (await jako(WL, '', 'select public.moja_org() as o'))[0].o;
    const b = (await jako(WS, '', 'select public.moja_org() as o'))[0].o;
    expect(a.rola).toBe('wlasciciel');
    expect(b.rola).toBe('wspolnik');
    expect(b.org_id).toBe(a.org_id);
  });
  it('osoba bez zaproszenia nie dostaje dostępu', async () => {
    expect((await jako(OBCY, 'obcy@example.com', 'select public.przyjmij_zaproszenie() as o'))[0].o).toBeNull();
    await expect(pull(OBCY)).rejects.toThrow(/nie należy/);
    await expect(push(OBCY, [rek('zlecenia', 'x', { klient: 'Włam' }, 1)])).rejects.toThrow(/nie należy/);
  });
  it('wspólnik nie może zapraszać', async () => {
    await expect(jako(WS, '', `select public.zapros_wspolnika('x@example.com')`)).rejects.toThrow(/właściciel/);
  });
});

describe('scalanie pole po polu', () => {
  it('równoczesna edycja różnych pól tego samego zlecenia zachowuje obie zmiany', async () => {
    await push(WL, [rek('zlecenia', 'z1', { klient: 'Kowalski', netto: 10000, brutto: 10800, notatki: '', status: 'Zaakceptowane', ekipa: ['wlasciciel', 'wspolnik'], utworzyl: 'wlasciciel' }, 1000)]);
    // oba urządzenia startują z tej samej wersji i zmieniają inne pola
    await push(WL, [rek('zlecenia', 'z1', { netto: 12000, brutto: 12960 }, 2000)]);
    await push(WS, [rek('zlecenia', 'z1', { notatki: 'Klucz u sąsiada', status: 'W realizacji' }, 2001)]);
    const z = (await pull(WL)).find((r) => r.id === 'z1')!;
    expect(z.dane).toMatchObject({ klient: 'Kowalski', netto: 12000, brutto: 12960, notatki: 'Klucz u sąsiada', status: 'W realizacji' });
  });
  it('w tym samym polu wygrywa późniejsza zmiana, niezależnie od kolejności dotarcia', async () => {
    await push(WL, [rek('zadania', 't1', { tytul: 'A', zrobione: false }, 100)]);
    await push(WS, [rek('zadania', 't1', { tytul: 'nowszy' }, 300)]);
    await push(WL, [rek('zadania', 't1', { tytul: 'starszy, ale dotarł później' }, 200)]);
    expect((await pull(WL)).find((r) => r.id === 't1')!.dane.tytul).toBe('nowszy');
  });
  it('powtórne wysłanie tej samej paczki niczego nie zmienia (idempotencja)', async () => {
    const przed = (await pull(WL)).find((r) => r.id === 't1')!;
    await push(WL, [rek('zadania', 't1', { tytul: 'A', zrobione: false }, 100)]);
    const po = (await pull(WL)).find((r) => r.id === 't1')!;
    expect(po.wersja).toBe(przed.wersja);
    expect(po.dane).toEqual(przed.dane);
  });
  it('usunięcie i przywrócenie to zwykłe pole ze znacznikiem czasu', async () => {
    await push(WL, [rek('zadania', 't2', { tytul: 'Do usunięcia', usuniety: false }, 100)]);
    await push(WL, [rek('zadania', 't2', { usuniety: true }, 200)]);
    await push(WS, [rek('zadania', 't2', { tytul: 'Poprawka w trakcie' }, 150)]);
    const t = (await pull(WL)).find((r) => r.id === 't2')!;
    expect(t.dane).toMatchObject({ usuniety: true, tytul: 'Poprawka w trakcie' });
  });
  it('pobieranie przyrostowe zwraca tylko nowsze wersje', async () => {
    const wszystko = await pull(WL);
    const ostatnia = Math.max(...wszystko.map((r) => Number(r.wersja)));
    expect(await pull(WL, ostatnia)).toHaveLength(0);
    await push(WL, [rek('zadania', 't3', { tytul: 'Nowe' }, 500)]);
    expect((await pull(WL, ostatnia)).map((r) => r.id)).toEqual(['t3']);
  });
});

describe('uprawnienia wspólnika egzekwowane w bazie', () => {
  it('nie widzi kwot zlecenia, cudzych godzin, kosztów, wypłat właściciela ani klientów', async () => {
    await push(WL, [
      rek('zlecenia', 'z2', { klient: 'Tajny', netto: 5000, ekipa: ['wlasciciel'], utworzyl: 'wlasciciel' }, 100),
      rek('godziny', 'g1', { osoba: 'wlasciciel', godziny: 8, zlecenieId: 'z1' }, 100),
      rek('godziny', 'g2', { osoba: 'wspolnik', godziny: 6, zlecenieId: 'z1' }, 100),
      rek('koszty', 'k1', { opis: 'Materiał', netto: 2000, zlecenieId: 'z1', utworzyl: 'wlasciciel' }, 100),
      rek('wyplaty', 'w1', { osoba: 'wlasciciel', kwota: 3000 }, 100),
      rek('wyplaty', 'w2', { osoba: 'wspolnik', kwota: 500 }, 100),
      rek('klienci', 'c1', { nazwa: 'Kowalski', telefon: '600100200' }, 100),
      rek('oferty', 'o1', { nr: 'BF/2026/001', klient: 'Kowalski' }, 100),
      rek('ustawienia', 'glowne', { firma: { nazwa: 'Beskid Floor' }, udzial: 60, stawka: 40, cennik: [{ klucz: 'pos', cena: 390 }], podatki: { zusMies: 1 } }, 100),
    ]);
    const w = await pull(WS);
    const po = (id: string) => w.find((r) => r.id === id)!;
    expect(po('z1').dane.klient).toBe('Kowalski');
    expect(po('z1').dane).not.toHaveProperty('netto');
    expect(po('z1').dane).not.toHaveProperty('brutto');
    for (const id of ['z2', 'g1', 'k1', 'w1', 'c1', 'o1']) expect(po(id).dane).toEqual({ _ukryty: true });
    expect(po('g2').dane.godziny).toBe(6);
    expect(po('w2').dane.kwota).toBe(500);
    expect(Object.keys(po('glowne').dane).sort()).toEqual(['firma', 'stawka']);
    expect(JSON.stringify(w)).not.toContain('Tajny');
    expect(JSON.stringify(w)).not.toContain('600100200');
  });
  it('nie może odczytać tabeli z pominięciem funkcji (RLS)', async () => {
    await jako(WS, '', 'select 1');
    await pg.exec('set role authenticated');
    try {
      expect((await pg.query('select * from public.rekordy')).rows).toHaveLength(0);
      await expect(pg.query(`insert into public.rekordy (org_id, tabela, id) values (public.bf_org(), 'koszty', 'hack')`)).rejects.toThrow();
      await expect(pg.query(`update public.rekordy set dane = '{}'`)).rejects.toThrow();
    } finally { await pg.exec('reset role'); }
    await jako(WL, '', 'select 1');
    await pg.exec('set role authenticated');
    try { expect((await pg.query('select * from public.rekordy')).rows.length).toBeGreaterThan(5); } finally { await pg.exec('reset role'); }
  });
  it('nie może zmienić kwot zlecenia, ustawień, wypłat ani cudzych godzin', async () => {
    const w = await push(WS, [
      rek('zlecenia', 'z1', { netto: 1, notatki: 'Zmiana wspólnika' }, 9000),
      rek('zlecenia', 'z2', { notatki: 'nie moje' }, 9000),
      rek('ustawienia', 'glowne', { udzial: 99, uprawnienia: { kwoty: true } }, 9000),
      rek('wyplaty', 'w9', { osoba: 'wspolnik', kwota: 99999 }, 9000),
      rek('godziny', 'g1', { godziny: 0 }, 9000),
      rek('godziny', 'g3', { osoba: 'wlasciciel', godziny: 5 }, 9000),
      rek('godziny', 'g4', { osoba: 'wspolnik', godziny: 7.5, zlecenieId: 'z1' }, 9000),
      rek('koszty', 'k1', { netto: 0 }, 9000),
      rek('koszty', 'k2', { opis: 'Wałek', netto: 30, zlecenieId: 'z1', utworzyl: 'wlasciciel' }, 9000),
    ]);
    expect(w.odrzucone.map((o: any) => o.id).sort()).toEqual(['g1', 'g3', 'glowne', 'k1', 'w9', 'z2']);
    const wl = await pull(WL);
    const po = (id: string) => wl.find((r) => r.id === id)?.dane;
    expect(po('z1')).toMatchObject({ netto: 12000, notatki: 'Zmiana wspólnika' }); // kwota nietknięta, notatka przyjęta
    expect(po('glowne').udzial).toBe(60);
    expect(po('w9')).toBeUndefined();
    expect(po('g1').godziny).toBe(8);
    expect(po('g4').godziny).toBe(7.5);
    expect(po('k1').netto).toBe(2000);
    expect(po('k2')).toMatchObject({ netto: 30, utworzyl: 'wspolnik' }); // autor nadpisany przez serwer
  });
  it('po włączeniu uprawnień przez właściciela wspólnik widzi kwoty i koszty', async () => {
    await push(WL, [rek('ustawienia', 'glowne', { uprawnienia: { kwoty: true, koszty: true, wszystkieZlecenia: true } }, 10000)]);
    const w = await pull(WS);
    expect(w.find((r) => r.id === 'z1')!.dane.netto).toBe(12000);
    expect(w.find((r) => r.id === 'z2')!.dane.klient).toBe('Tajny');
    expect(w.find((r) => r.id === 'k1')!.dane.netto).toBe(2000);
    expect(w.find((r) => r.id === 'c1')!.dane).toEqual({ _ukryty: true });
  });
});
