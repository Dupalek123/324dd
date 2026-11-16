import { describe, expect, it } from 'vitest';
import {
  wynikZlecenia, podzialZysku, rozliczenie, saldo, kalkulatorDojazdu, sumaDojazdow, nastepnyNumer, sumaOferty,
  zlecenieZOferty, kwotaZCenyM2, zuzycieMaterialow, rozksieguj, szacunekPodatkow, podpowiedzDni,
} from '../src/lib/obliczenia';
import { CENNIK } from '../src/lib/domyslne';
import type { Koszt, Oferta, WpisGodzin, Wyplata, Zlecenie } from '../src/lib/typy';

const ust = { udzial: 60, stawka: 40 };
const zl = (p: Partial<Zlecenie>): Zlecenie => ({
  id: 'z1', _ts: {}, _zm: 0, utworzono: 0, utworzyl: 'wlasciciel', klient: 'K', telefon: '', adres: '', opis: '', system: 'LIFE', typPrac: 'Podłoga',
  m2: 50, cenaM2: null, vat: 8, netto: 10000, brutto: 10800, status: 'Zakończone', dataStart: '2026-03-01', dataKoniec: '2026-03-10',
  klientOd: 'wlasciciel', tryb: 'razem', udzial: null, stawka: null, ekipa: ['wlasciciel', 'wspolnik'], notatki: '', ...p,
});
const ko = (p: Partial<Koszt>): Koszt => ({
  id: Math.random().toString(36), _ts: {}, _zm: 0, utworzono: 0, utworzyl: 'wlasciciel', data: '2026-03-02', zlecenieId: 'z1', ogolny: false,
  kategoria: 'Materiał', opis: '', dostawca: '', vat: 23, netto: 0, brutto: 0, ...p,
});
const gd = (osoba: 'wlasciciel' | 'wspolnik', godziny: number, zlecenieId = 'z1'): WpisGodzin => ({
  id: Math.random().toString(36), _ts: {}, _zm: 0, utworzono: 0, utworzyl: osoba, data: '2026-03-03', osoba, zlecenieId, godziny, opis: '',
});

describe('wynik zlecenia', () => {
  it('przychód netto − suma kosztów netto, z podziałem na kategorie i marżą', () => {
    const koszty = [
      ko({ netto: 2000, brutto: 2460, kategoria: 'Materiał' }),
      ko({ netto: 500, brutto: 615, kategoria: 'Materiał' }),
      ko({ netto: 300, brutto: 369, kategoria: 'Transport' }),
      ko({ netto: 999, brutto: 1228.77, zlecenieId: 'inne' }),
      ko({ netto: 700, brutto: 861, usuniety: true }),
    ];
    const w = wynikZlecenia(zl({}), koszty);
    expect(w.przychod).toBe(10000);
    expect(w.koszty).toBe(2800);
    expect(w.wgKategorii['Materiał']).toBe(2500);
    expect(w.wgKategorii['Transport']).toBe(300);
    expect(w.kosztyBrutto).toBe(3444);
    expect(w.wynik).toBe(7200);
    expect(w.marza).toBe(72);
  });
  it('liczy od netto, nie od brutto', () => {
    const w = wynikZlecenia(zl({ netto: 1000, brutto: 1230, vat: 23 }), [ko({ netto: 100, brutto: 123 })]);
    expect(w.wynik).toBe(900);
  });
  it('zlecenie bez kosztów: wynik = przychód, marża 100%', () => {
    const w = wynikZlecenia(zl({}), []);
    expect(w.koszty).toBe(0);
    expect(w.wynik).toBe(10000);
    expect(w.marza).toBe(100);
  });
  it('zerowy przychód nie dzieli przez zero; strata daje ujemny wynik', () => {
    const w = wynikZlecenia(zl({ netto: 0, brutto: 0 }), [ko({ netto: 150, brutto: 184.5 })]);
    expect(w.wynik).toBe(-150);
    expect(w.marza).toBe(0);
  });
  it('uwzględnia rozksięgowaną część kosztu ogólnego', () => {
    const ogolny = ko({ zlecenieId: null, ogolny: true, netto: 1000, brutto: 1230, rozdzial: [{ zlecenieId: 'z1', netto: 400 }, { zlecenieId: 'z2', netto: 600 }] });
    const w = wynikZlecenia(zl({}), [ogolny, ko({ zlecenieId: null, ogolny: true, netto: 5000, brutto: 6150 })]);
    expect(w.ogolne).toBe(400);
    expect(w.koszty).toBe(400);
    expect(w.wynik).toBe(9600);
  });
  it('sumuje grosze bez błędów zmiennoprzecinkowych', () => {
    const w = wynikZlecenia(zl({ netto: 1 }), [ko({ netto: 0.1 }), ko({ netto: 0.2 }), ko({ netto: 0.3 })]);
    expect(w.koszty).toBe(0.6);
    expect(w.wynik).toBe(0.4);
  });
});

describe('rozliczenie – tryb RAZEM', () => {
  it('domyślnie 60/40 dla osoby z pola „Klient od”', () => {
    const p = podzialZysku(zl({ klientOd: 'wlasciciel' }), 7200, [], ust);
    expect(p.kwoty).toEqual({ wlasciciel: 4320, wspolnik: 2880 });
  });
  it('gdy klienta załatwił wspólnik, to on bierze 60%', () => {
    const p = podzialZysku(zl({ klientOd: 'wspolnik' }), 7200, [], ust);
    expect(p.kwoty).toEqual({ wlasciciel: 2880, wspolnik: 4320 });
  });
  it('procent inny niż 60: globalny i nadpisany w zleceniu', () => {
    expect(podzialZysku(zl({}), 1000, [], { udzial: 70, stawka: 40 }).kwoty).toEqual({ wlasciciel: 700, wspolnik: 300 });
    expect(podzialZysku(zl({ udzial: 50 }), 1000, [], ust).kwoty).toEqual({ wlasciciel: 500, wspolnik: 500 });
    expect(podzialZysku(zl({ udzial: 100 }), 1000, [], ust).kwoty).toEqual({ wlasciciel: 1000, wspolnik: 0 });
    expect(podzialZysku(zl({ udzial: 0 }), 1000, [], ust).kwoty).toEqual({ wlasciciel: 0, wspolnik: 1000 });
  });
  it('części zawsze sumują się do wyniku co do grosza', () => {
    for (const wynik of [0.01, 0.03, 100.01, 3333.33, 7199.99, -250.55]) for (const udzial of [60, 33, 66.6, 55]) {
      const p = podzialZysku(zl({ udzial }), wynik, [], ust);
      expect(Math.round((p.kwoty.wlasciciel + p.kwoty.wspolnik) * 100)).toBe(Math.round(wynik * 100));
    }
  });
  it('stratę dzieli tym samym procentem', () => {
    expect(podzialZysku(zl({}), -1000, [], ust).kwoty).toEqual({ wlasciciel: -600, wspolnik: -400 });
  });
  it('godziny nie wpływają na podział w trybie RAZEM', () => {
    const p = podzialZysku(zl({}), 1000, [gd('wspolnik', 30)], ust);
    expect(p.kwoty).toEqual({ wlasciciel: 600, wspolnik: 400 });
    expect(p.godziny.wspolnik).toBe(30);
  });
});

describe('rozliczenie – tryb SAM + POMOC GODZINOWA', () => {
  const z = zl({ tryb: 'godz', klientOd: 'wlasciciel' });
  it('pomocnik dostaje godziny × stawka, reszta dla osoby z „Klient od”', () => {
    const p = podzialZysku(z, 7200, [gd('wspolnik', 10), gd('wspolnik', 2.5), gd('wlasciciel', 40), gd('wspolnik', 8, 'inne')], ust);
    expect(p.pomoc).toBe(500);
    expect(p.kwoty).toEqual({ wlasciciel: 6700, wspolnik: 500 });
    expect(p.godziny).toEqual({ wlasciciel: 40, wspolnik: 12.5 });
  });
  it('brak godzin pomocnika = pomocnik 0 zł', () => {
    const p = podzialZysku(z, 7200, [gd('wlasciciel', 40)], ust);
    expect(p.kwoty).toEqual({ wlasciciel: 7200, wspolnik: 0 });
  });
  it('stawka nadpisana w zleceniu ma pierwszeństwo przed domyślną', () => {
    const p = podzialZysku({ ...z, stawka: 55 }, 7200, [gd('wspolnik', 10)], ust);
    expect(p.kwoty).toEqual({ wlasciciel: 6650, wspolnik: 550 });
  });
  it('gdy klienta załatwił wspólnik, pomocnikiem jest właściciel', () => {
    const p = podzialZysku({ ...z, klientOd: 'wspolnik' }, 2000, [gd('wlasciciel', 5), gd('wspolnik', 30)], ust);
    expect(p.kwoty).toEqual({ wlasciciel: 200, wspolnik: 1800 });
  });
  it('kroki 0,25 h i usunięte wpisy', () => {
    const p = podzialZysku(z, 1000, [gd('wspolnik', 0.25), gd('wspolnik', 0.75), { ...gd('wspolnik', 100), usuniety: true }], ust);
    expect(p.kwoty.wspolnik).toBe(40);
  });
  it('pomocnik dostaje wynagrodzenie także przy stracie na zleceniu', () => {
    const p = podzialZysku(z, -100, [gd('wspolnik', 10)], ust);
    expect(p.kwoty).toEqual({ wlasciciel: -500, wspolnik: 400 });
  });
});

describe('widok Rozliczenie', () => {
  const zlecenia = [
    zl({ id: 'a', netto: 10000, status: 'Zakończone', dataKoniec: '2026-03-10' }),
    zl({ id: 'b', netto: 5000, status: 'W realizacji', tryb: 'godz', dataKoniec: null, dataStart: '2026-04-02' }),
    zl({ id: 'c', netto: 9000, status: 'Oferta' }),
    zl({ id: 'd', netto: 9000, status: 'Zakończone', usuniety: true }),
  ];
  const koszty = [ko({ zlecenieId: 'a', netto: 2000 }), ko({ zlecenieId: 'b', netto: 1000 })];
  const godziny = [gd('wspolnik', 10, 'b'), gd('wlasciciel', 20, 'a')];
  const wyplaty: Wyplata[] = [{ id: 'w', _ts: {}, _zm: 0, utworzono: 0, utworzyl: 'wlasciciel', data: '2026-03-20', osoba: 'wspolnik', kwota: 1200, zlecenieId: 'a', opis: '' }];
  it('sumuje należności wg trybów, pomija oferty i usunięte', () => {
    const r = rozliczenie(zlecenia, koszty, godziny, wyplaty, ust, { status: 'wszystkie' });
    expect(r.wiersze.map((w) => w.zlecenie.id)).toEqual(['a', 'b']);
    // a: wynik 8000 → 4800 / 3200; b: wynik 4000, pomoc 400 → 3600 / 400
    expect(r.suma).toEqual({ wlasciciel: 8400, wspolnik: 3600 });
    expect(r.godziny).toEqual({ wlasciciel: 20, wspolnik: 10 });
    expect(r.wynik).toBe(12000);
    expect(r.wiersze[0].wyplacono.wspolnik).toBe(1200);
  });
  it('filtry statusu i zakresu dat', () => {
    expect(rozliczenie(zlecenia, koszty, godziny, wyplaty, ust, { status: 'zakonczone' }).suma).toEqual({ wlasciciel: 4800, wspolnik: 3200 });
    expect(rozliczenie(zlecenia, koszty, godziny, wyplaty, ust, { status: 'w_realizacji' }).suma).toEqual({ wlasciciel: 3600, wspolnik: 400 });
    expect(rozliczenie(zlecenia, koszty, godziny, wyplaty, ust, { status: 'wszystkie', od: '2026-04-01', do: '2026-04-30' }).wiersze.map((w) => w.zlecenie.id)).toEqual(['b']);
  });
  it('saldo = należne z zakończonych − wypłaty', () => {
    const s = saldo(zlecenia, koszty, godziny, wyplaty, ust);
    expect(s.wspolnik).toEqual({ nalezne: 3200, wyplacono: 1200, saldo: 2000 });
    expect(s.wlasciciel).toEqual({ nalezne: 4800, wyplacono: 0, saldo: 4800 });
  });
  it('szacunek podatków korzysta wyłącznie z parametrów użytkownika', () => {
    expect(szacunekPodatkow(10000, 2, { wlaczone: true, podatekProc: 12, zdrowotnaProc: 9, zusMies: 1500 })).toEqual({ podatek: 1200, zdrowotna: 900, zus: 3000, razem: 5100, naReke: 4900 });
    expect(szacunekPodatkow(10000, 1, { wlaczone: true, podatekProc: 0, zdrowotnaProc: 0, zusMies: 0 }).razem).toBe(0);
  });
});

describe('kalkulator dojazdów', () => {
  it('dni × km × 2 → litry → koszt paliwa + eksploatacja', () => {
    const w = kalkulatorDojazdu({ dni: 5, kmJednaStrona: 32, tamIPowrot: true, spalanie: 8, cenaPaliwa: 6.5, zlKm: 0.3 });
    expect(w.km).toBe(320);
    expect(w.litry).toBe(25.6);
    expect(w.kosztPaliwa).toBe(166.4);
    expect(w.kosztEksploatacji).toBe(96);
    expect(w.razem).toBe(262.4);
  });
  it('w jedną stronę i bez stawki za km', () => {
    const w = kalkulatorDojazdu({ dni: 1, kmJednaStrona: 45.5, tamIPowrot: false, spalanie: 7.2, cenaPaliwa: 6.79 });
    expect(w.km).toBe(45.5);
    expect(w.litry).toBe(3.28);
    expect(w.kosztPaliwa).toBe(22.27);
    expect(w.kosztEksploatacji).toBe(0);
    expect(w.razem).toBe(22.27);
  });
  it('zera i wartości ujemne dają zero', () => {
    expect(kalkulatorDojazdu({ dni: 0, kmJednaStrona: 30, tamIPowrot: true, spalanie: 8, cenaPaliwa: 6.5 }).razem).toBe(0);
    expect(kalkulatorDojazdu({ dni: -2, kmJednaStrona: 30, tamIPowrot: true, spalanie: 8, cenaPaliwa: 6.5 }).km).toBe(0);
  });
  it('podsumowanie km i litrów', () => {
    const d = { dni: 1, kmJednaStrona: 1, tamIPowrot: true, spalanie: 8, cenaPaliwa: 6.5, zlKm: 0 };
    const s = sumaDojazdow([
      ko({ netto: 100, brutto: 123, dojazd: { ...d, km: 320, litry: 25.6 } }),
      ko({ netto: 50, brutto: 61.5, dojazd: { ...d, km: 100.5, litry: 8.04 } }),
      ko({ netto: 999 }),
      ko({ netto: 10, dojazd: { ...d, km: 50, litry: 4 }, usuniety: true }),
    ]);
    expect(s).toEqual({ km: 420.5, litry: 33.64, netto: 150, brutto: 184.5, liczba: 2 });
  });
});

describe('oferty', () => {
  it('numeracja BF/rok/numer', () => {
    expect(nastepnyNumer([], 2026)).toBe('BF/2026/001');
    expect(nastepnyNumer(['BF/2026/001', 'BF/2026/002'], 2026)).toBe('BF/2026/003');
    expect(nastepnyNumer(['BF/2026/009', 'BF/2026/003'], 2026)).toBe('BF/2026/010');
    expect(nastepnyNumer(['BF/2025/041', 'BF/2025/042'], 2026)).toBe('BF/2026/001'); // nowy rok = od nowa
    expect(nastepnyNumer(['BF/2026/999'], 2026)).toBe('BF/2026/1000');
    expect(nastepnyNumer(['', 'szkic', 'BF/2026/x', ' BF/2026/004 '], 2026)).toBe('BF/2026/005');
  });
  const oferta = (ilosci: Record<string, number>, p: Partial<Oferta> = {}): Oferta => ({
    id: 'o1', _ts: {}, _zm: 0, utworzono: 0, utworzyl: 'wlasciciel', nr: 'BF/2026/001', data: '2026-03-01', klient: 'Anna Nowak', telefon: '600 100 200',
    email: '', adres: 'ul. Leśna 5, Bielsko-Biała', system: 'TITAN Standard', vat: 8, niestandardowe: false,
    pozycje: CENNIK.map((c) => ({ ...c, ilosc: ilosci[c.klucz] ?? null })), dni: 7, startDni: 14, zaliczka: 20, waznosc: 14, uwagi: '', status: 'robocza', ...p,
  });
  it('tylko pozycje z wpisaną ilością; sumy netto, VAT, brutto', () => {
    const s = sumaOferty(oferta({ pos: 40, sm: 12.5, hy: 12.5, st: 14 }));
    expect(s.wiersze.map((w) => w.pozycja.klucz)).toEqual(['pos', 'sm', 'hy', 'st']);
    expect(s.wiersze.map((w) => w.wartosc)).toEqual([15600, 4875, 1500, 12600]);
    expect(s.netto).toBe(34575);
    expect(s.vat).toBe(2766);
    expect(s.brutto).toBe(37341);
    expect(s.m2).toBe(52.5);
  });
  it('przełącznik „niestandardowe” podnosi ceny posadzek i ścian, ale nie garażu', () => {
    const s = sumaOferty(oferta({ pos: 10, sg: 10, sm: 10, ga: 10, hy: 10 }, { niestandardowe: true }));
    expect(s.wiersze.map((w) => w.cena)).toEqual([410, 310, 410, 120, 290]);
  });
  it('garaż ma własny wariant „wersja rozszerzona”', () => {
    const o = oferta({ ga: 20 });
    o.pozycje.find((p) => p.klucz === 'ga')!.wariant = true;
    expect(sumaOferty(o).netto).toBe(6400);
  });
  it('VAT 23% i ceny edytowane ręcznie', () => {
    const o = oferta({ pos: 33.3 }, { vat: 23 });
    o.pozycje[0].cena = 399.99;
    const s = sumaOferty(o);
    expect(s.netto).toBe(13319.67);
    expect(s.vat).toBe(3063.52);
    expect(s.brutto).toBe(16383.19);
  });
  it('pusta oferta', () => { expect(sumaOferty(oferta({}))).toMatchObject({ netto: 0, vat: 0, brutto: 0, m2: 0 }); });
  it('zamiana na zlecenie kopiuje klienta, adres, m², kwoty, system i ustawia status', () => {
    const z = zlecenieZOferty(oferta({ pos: 40, sm: 12.5, hy: 12.5 }));
    expect(z).toMatchObject({ klient: 'Anna Nowak', adres: 'ul. Leśna 5, Bielsko-Biała', system: 'TITAN Standard', m2: 52.5, vat: 8, netto: 21975, brutto: 23733, status: 'Zaakceptowane', ofertaId: 'o1', typPrac: 'Łazienka' });
    expect(z.opis).toContain('Posadzki dekoracyjne: 40 m²');
    expect(z.cenaM2).toBe(452.06);
  });
  it('podpowiedź czasu realizacji rośnie z powierzchnią', () => {
    expect(podpowiedzDni(0)).toBe(0);
    expect(podpowiedzDni(20)).toBe(5);
    expect(podpowiedzDni(100)).toBe(8);
    expect(podpowiedzDni(0, 16)).toBe(6);
  });
});

describe('zlecenie i materiały', () => {
  it('cena brutto za m² wylicza kwotę brutto i netto', () => {
    expect(kwotaZCenyM2(50, 432, 8)).toEqual({ brutto: 21600, netto: 20000 });
    expect(kwotaZCenyM2(12.5, 399.99, 23)).toEqual({ brutto: 4999.88, netto: 4064.94 });
  });
  it('zużycie = m² × zużycie × warstwy, opakowania zaokrąglane w górę', () => {
    const w = zuzycieMaterialow(50, [
      { nazwa: 'Baza', zuzycie: 1, warstwy: 2, jedn: 'kg', opakowanie: 20 },
      { nazwa: 'Lakier', zuzycie: 0.08, warstwy: 2, jedn: 'l', opakowanie: 5 },
      { nazwa: 'Grunt', zuzycie: 0.1, warstwy: 1, jedn: 'kg', opakowanie: 5 },
    ]);
    expect(w.map((x) => [x.ilosc, x.opakowania])).toEqual([[100, 5], [8, 2], [5, 1]]);
  });
  it('rozksięgowanie kosztu ogólnego: po równo i proporcjonalnie, suma co do grosza', () => {
    const zs = [{ id: 'a', netto: 10000 }, { id: 'b', netto: 5000 }, { id: 'c', netto: 5000 }];
    expect(rozksieguj(100, zs, 'rowno').map((r) => r.netto)).toEqual([33.33, 33.33, 33.34]);
    expect(rozksieguj(1000, zs, 'przychod').map((r) => r.netto)).toEqual([500, 250, 250]);
    expect(rozksieguj(100, [], 'rowno')).toEqual([]);
  });
});
