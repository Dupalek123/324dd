import { describe, expect, it } from 'vitest';
import { doZdalnego, nalozZmiany, scal, scalNaSerwerze, type RekordZdalny } from '../src/lib/scalanie';
import { widokRekordu, widoczneZleceniaWspolnika } from '../src/lib/uprawnienia';
import { UPRAWNIENIA } from '../src/lib/domyslne';
import type { Rek, Zlecenie } from '../src/lib/typy';

type Z = Rek & { klient?: string; netto?: number; notatki?: string; status?: string };

describe('dwie osoby edytują jednocześnie', () => {
  it('zmiany różnych pól tego samego rekordu łączą się na obu urządzeniach', () => {
    const start = nalozZmiany<Z>(undefined, 'z1', { klient: 'Kowalski', netto: 10000, notatki: '', status: 'Zaakceptowane' }, 1000).rek;
    let serwer: RekordZdalny = scalNaSerwerze(undefined, doZdalnego('zlecenia', start));
    // offline: Janek zmienia kwotę, Kuba notatkę i status
    const janek = nalozZmiany<Z>(start, 'z1', { netto: 12000 }, 2000).rek;
    const kuba = nalozZmiany<Z>(start, 'z1', { notatki: 'Klucz u sąsiada', status: 'W realizacji' }, 2001).rek;
    serwer = scalNaSerwerze(serwer, doZdalnego('zlecenia', janek));
    serwer = scalNaSerwerze(serwer, doZdalnego('zlecenia', kuba));
    const uJanka = scal(janek, serwer);
    const uKuby = scal(kuba, serwer);
    for (const u of [uJanka, uKuby]) {
      expect(u.rek).toMatchObject({ klient: 'Kowalski', netto: 12000, notatki: 'Klucz u sąsiada', status: 'W realizacji' });
      expect(u.brudne).toBe(false);
    }
  });
  it('to samo pole: wygrywa późniejsza zmiana, oba urządzenia zbiegają do tej samej wartości', () => {
    const start = nalozZmiany<Z>(undefined, 'z1', { notatki: 'a' }, 1000).rek;
    const a = nalozZmiany<Z>(start, 'z1', { notatki: 'Janek' }, 2000).rek;
    const b = nalozZmiany<Z>(start, 'z1', { notatki: 'Kuba' }, 3000).rek;
    let serwer = scalNaSerwerze(undefined, doZdalnego('zlecenia', b));
    serwer = scalNaSerwerze(serwer, doZdalnego('zlecenia', a)); // starsza zmiana dociera później
    expect(scal(a, serwer).rek.notatki).toBe('Kuba');
    expect(scal(b, serwer).rek.notatki).toBe('Kuba');
  });
  it('lokalna zmiana nowsza niż w chmurze zostaje i jest oznaczona do wysłania', () => {
    const start = nalozZmiany<Z>(undefined, 'z1', { notatki: 'a', netto: 1 }, 1000).rek;
    const serwer = scalNaSerwerze(undefined, doZdalnego('zlecenia', nalozZmiany<Z>(start, 'z1', { netto: 2 }, 1500).rek));
    const lokalny = nalozZmiany<Z>(start, 'z1', { notatki: 'offline' }, 5000).rek;
    const w = scal(lokalny, serwer);
    expect(w.rek).toMatchObject({ notatki: 'offline', netto: 2 });
    expect(w.brudne).toBe(true);
  });
  it('pola ukryte przez serwer nie kasują się lokalnie', () => {
    const lokalny = nalozZmiany<Z>(undefined, 'z1', { notatki: 'a' }, 1000).rek;
    const w = scal(lokalny, { tabela: 'zlecenia', id: 'z1', dane: { notatki: 'b' }, pola_ts: { notatki: 2000, netto: 2000 } });
    expect(w.rek.notatki).toBe('b');
    expect('netto' in w.rek).toBe(false);
  });
  it('zapis bez faktycznej zmiany nie stempluje pól', () => {
    const start = nalozZmiany<Z>(undefined, 'z1', { notatki: 'a' }, 1000).rek;
    const { rek, zmienione } = nalozZmiany<Z>(start, 'z1', { notatki: 'a' }, 2000);
    expect(zmienione).toEqual({});
    expect(rek._ts.notatki).toBe(1000);
  });
});

describe('widok wspólnika', () => {
  const z = { id: 'z1', klient: 'K', netto: 100, brutto: 108, cenaM2: 10, vat: 8, udzial: 60, notatki: 'n', ekipa: ['wlasciciel', 'wspolnik'] } as unknown as Zlecenie;
  it('domyślnie ukrywa kwoty, marże i koszty', () => {
    const w = widokRekordu('zlecenia', z, 'wspolnik', UPRAWNIENIA)!;
    expect(w).toMatchObject({ klient: 'K', notatki: 'n' });
    for (const p of ['netto', 'brutto', 'cenaM2', 'vat', 'udzial']) expect(p in w).toBe(false);
    expect(widokRekordu('zlecenia', { ...z, ekipa: ['wlasciciel'] }, 'wspolnik', UPRAWNIENIA)).toBeNull();
    expect(widokRekordu('koszty', { utworzyl: 'wlasciciel' }, 'wspolnik', UPRAWNIENIA)).toBeNull();
    expect(widokRekordu('koszty', { utworzyl: 'wspolnik' }, 'wspolnik', UPRAWNIENIA)).not.toBeNull();
    expect(widokRekordu('godziny', { osoba: 'wlasciciel' }, 'wspolnik', UPRAWNIENIA)).toBeNull();
    expect(widokRekordu('godziny', { osoba: 'wspolnik' }, 'wspolnik', UPRAWNIENIA)).not.toBeNull();
    expect(widokRekordu('wyplaty', { osoba: 'wlasciciel' }, 'wspolnik', UPRAWNIENIA)).toBeNull();
    expect(widokRekordu('klienci', {}, 'wspolnik', UPRAWNIENIA)).toBeNull();
    expect(widokRekordu('oferty', {}, 'wspolnik', UPRAWNIENIA)).toBeNull();
    expect(widokRekordu('zadania', {}, 'wspolnik', UPRAWNIENIA)).not.toBeNull();
  });
  it('właściciel widzi wszystko; uprawnienia można włączyć', () => {
    expect(widokRekordu('zlecenia', z, 'wlasciciel', UPRAWNIENIA)).toBe(z);
    expect(widokRekordu('zlecenia', z, 'wspolnik', { ...UPRAWNIENIA, kwoty: true })).toMatchObject({ netto: 100 });
    expect(widokRekordu('koszty', { utworzyl: 'wlasciciel' }, 'wspolnik', { ...UPRAWNIENIA, koszty: true })).not.toBeNull();
  });
  it('paragony tylko z uprawnieniem do kosztów, zdjęcia tylko z widocznych zleceń', () => {
    const widoczne = widoczneZleceniaWspolnika([{ id: 'z1', ekipa: ['wspolnik'] }, { id: 'z2', ekipa: ['wlasciciel'] }], UPRAWNIENIA);
    expect([...widoczne]).toEqual(['z1']);
    expect(widokRekordu('pliki', { rodzaj: 'paragon', zlecenieId: 'z1' }, 'wspolnik', UPRAWNIENIA, widoczne)).toBeNull();
    expect(widokRekordu('pliki', { rodzaj: 'zdjecie', zlecenieId: 'z1' }, 'wspolnik', UPRAWNIENIA, widoczne)).not.toBeNull();
    expect(widokRekordu('pliki', { rodzaj: 'zdjecie', zlecenieId: 'z2' }, 'wspolnik', UPRAWNIENIA, widoczne)).toBeNull();
  });
  it('z ustawień wspólnik nie dostaje cennika, procentu podziału ani parametrów podatkowych', () => {
    const u = widokRekordu('ustawienia', { firma: {}, cennik: [], udzial: 60, podatki: {}, stawka: 40 } as never, 'wspolnik', UPRAWNIENIA)!;
    expect(Object.keys(u).sort()).toEqual(['firma', 'stawka']);
  });
});
