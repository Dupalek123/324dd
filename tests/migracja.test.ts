import { describe, expect, it } from 'vitest';
import { czyStaryFormat, dataIso, migrujStare } from '../src/lib/migracja';
import { podzialZysku, sumaOferty, wynikZlecenia, sumaDojazdow } from '../src/lib/obliczenia';
import { wyciagnijLokalnie } from '../src/lib/wyciaganie';
import stare from './dane/stara-kopia.json';

let licznik = 0;
const id = () => `n${++licznik}`;

describe('migracja ze starego prototypu', () => {
  const w = migrujStare(stare, id, 1);
  const { zlecenia = [], koszty = [], godziny = [], oferty = [], klienci = [] } = w.tabele as any;

  it('rozpoznaje stary format', () => {
    expect(czyStaryFormat(stare)).toBe(true);
    expect(czyStaryFormat({ format: 'beskid-floor-panel', tabele: {} })).toBe(false);
    expect(czyStaryFormat({ cokolwiek: 1 })).toBe(false);
    expect(czyStaryFormat(null)).toBe(false);
  });
  it('odtwarza wszystkie zlecenia, koszty, godziny i oferty', () => {
    expect(w.liczniki).toMatchObject({ zlecenia: stare.zl.length, koszty: stare.ko.length, godziny: stare.gd.length, oferty: stare.of.length });
    expect(zlecenia.map((z: any) => z.klient)).toEqual(stare.zl.map((z) => z.klient));
  });
  it('przenosi ustawienia: firma, osoby, procent, stawka, parametry auta', () => {
    expect(w.ustawienia.firma).toMatchObject({ nazwa: 'Beskid Floor', nip: '5470000000', telefon: '600 000 000', email: 'kontakt@example.com', adres: 'ul. Górska 1, Bielsko-Biała' });
    expect(w.ustawienia.ludzie).toEqual({ wlasciciel: { imie: 'Janek' }, wspolnik: { imie: 'Kuba' } });
    expect(w.ustawienia.udzial).toBe(60);
    expect(w.ustawienia.stawka).toBe(35);
    expect(w.ustawienia.dojazd).toMatchObject({ spalanie: 8.5, cenaPaliwa: 6.49, zlKm: 0.25 });
  });
  it('zlecenie: kwoty, status, tryb, „Klient od” (po imieniu) i stawka per zlecenie', () => {
    const [a, b, c] = zlecenia;
    expect(a).toMatchObject({ klient: 'Anna Nowak', telefon: '601 111 222', adres: 'ul. Leśna 5, Bielsko-Biała', system: 'TITAN Standard', m2: 48, cenaM2: 432, vat: 8, netto: 19200, brutto: 20736, status: 'Zakończone', klientOd: 'wlasciciel', tryb: 'razem', stawka: null, stareId: '1700000000001' });
    expect(b).toMatchObject({ klient: 'Piotr Wiśniewski', status: 'W realizacji', klientOd: 'wspolnik', tryb: 'godz', stawka: 45, netto: 8130.08, brutto: 10000, vat: 23 });
    expect(c).toMatchObject({ status: 'Oferta', netto: 5000, brutto: 5400 }); // brak brutto → wyliczone; kwota = netto
  });
  it('koszty i godziny trafiają do właściwych zleceń (id jako liczba lub tekst)', () => {
    const [a, b] = zlecenia;
    expect(koszty.filter((k: any) => k.zlecenieId === a.id)).toHaveLength(3);
    expect(koszty.filter((k: any) => k.zlecenieId === b.id)).toHaveLength(1);
    expect(godziny.filter((g: any) => g.zlecenieId === a.id).map((g: any) => [g.osoba, g.godziny, g.data])).toEqual([['wlasciciel', 8, '2026-03-02'], ['wspolnik', 7.5, '2026-03-02'], ['wspolnik', 6.25, '2026-03-03']]);
    expect(godziny.find((g: any) => g.zlecenieId === b.id)).toMatchObject({ osoba: 'wlasciciel', godziny: 4 });
  });
  it('koszt z nieistniejącym zleceniem nie ginie – staje się kosztem ogólnym z ostrzeżeniem', () => {
    const sierota = koszty.find((k: any) => k.opis === 'Ubezpieczenie OC [Ubezpieczenia]');
    expect(sierota).toMatchObject({ zlecenieId: null, ogolny: true, netto: 1200, kategoria: 'Inne' });
    expect(w.ostrzezenia.join(' ')).toContain('999');
  });
  it('dojazd zachowuje km i litry do statystyk', () => {
    const d = koszty.find((k: any) => k.dojazd);
    expect(d).toMatchObject({ kategoria: 'Transport', netto: 162.6, brutto: 200, dojazd: { km: 320, litry: 27.2 } });
    expect(sumaDojazdow(koszty)).toMatchObject({ km: 320, litry: 27.2, liczba: 1 });
  });
  it('wynik i rozliczenie po imporcie zgadzają się z danymi źródłowymi', () => {
    const [a, b] = zlecenia;
    const wa = wynikZlecenia(a, koszty);
    expect(wa.koszty).toBe(4162.6);
    expect(wa.wynik).toBe(15037.4);
    expect(podzialZysku(a, wa.wynik, godziny, w.ustawienia as any).kwoty).toEqual({ wlasciciel: 9022.44, wspolnik: 6014.96 });
    const wb = wynikZlecenia(b, koszty);
    // klient od Kuby, tryb godzinowy: pomocnikiem jest Janek (4 h × 45 zł)
    expect(podzialZysku(b, wb.wynik, godziny, w.ustawienia as any).kwoty).toEqual({ wlasciciel: 180, wspolnik: 7450.08 });
  });
  it('oferta: pozycje wg kluczy, ceny z kopii, parametry i sumy', () => {
    const o = oferty[0];
    expect(o).toMatchObject({ nr: 'BF/2026/003', data: '2026-02-14', klient: 'Anna Nowak', email: 'anna@example.com', system: 'TITAN Standard', vat: 8, dni: 7, startDni: 14, zaliczka: 20, waznosc: 14, uwagi: 'Kolor: jasny beż', niestandardowe: false });
    const s = sumaOferty(o);
    expect(s.wiersze.map((x) => [x.pozycja.klucz, x.pozycja.ilosc, x.cena])).toEqual([['pos', 48, 400], ['sm', 12, 390], ['hy', 12, 120], ['st', 14, 900]]);
    expect(s.netto).toBe(37920);
    expect(o.pozycje).toHaveLength(14); // pełny cennik zostaje do dalszej edycji
  });
  it('oferta niestandardowa zachowuje ceny wpisane w kopii, a tekstowy termin trafia do uwag', () => {
    const o = oferty[1];
    expect(o.niestandardowe).toBe(true);
    expect(sumaOferty(o).netto).toBe(20 * 410 + 2 * 777);
    expect(o.pozycje.at(-1)).toMatchObject({ klucz: 'spa', grupa: 'własne', ilosc: 2, cena: 777 });
    expect(o.startDni).toBeNull();
    expect(o.uwagi).toContain('po 1 maja');
  });
  it('tworzy kartotekę klientów bez duplikatów', () => {
    expect(klienci.map((k: any) => k.nazwa).sort()).toEqual(['Anna Nowak', 'Firma XYZ', 'Piotr Wiśniewski']);
    const anna = klienci.find((k: any) => k.nazwa === 'Anna Nowak');
    expect(anna.email).toBe('anna@example.com');
    expect(zlecenia[0].klientId).toBe(anna.id);
    expect(oferty[0].klientId).toBe(anna.id);
  });
  it('pusty lub niepełny plik nie wywraca importu', () => {
    expect(migrujStare({}, id).liczniki).toMatchObject({ zlecenia: 0, koszty: 0, godziny: 0, oferty: 0 });
    expect(migrujStare({ zl: [{ id: 1 }], gd: [{}], ko: [{}], of: [{}] }, id).liczniki).toMatchObject({ zlecenia: 1, koszty: 1, godziny: 1, oferty: 1 });
  });
  it('daty w różnych zapisach', () => {
    expect(dataIso('2026-3-7')).toBe('2026-03-07');
    expect(dataIso('07.03.2026')).toBe('2026-03-07');
    expect(dataIso('')).toBe('');
  });
});

describe('wyciąganie danych z wiadomości (parser lokalny)', () => {
  it('mail z metrażami, schodami i łazienką', () => {
    const d = wyciagnijLokalnie(`Od: Marta Zielińska <marta.z@example.com>
Dzień dobry,
proszę o wycenę mikrocementu w domu przy ul. Sosnowa 12, 43-300 Bielsko-Biała.
Podłoga w salonie i kuchni 62,5 m2, ściany w łazience przy prysznicu 14 m2 oraz schody 15 stopni.
Do tego garaż 30 mkw. Jest ogrzewanie podłogowe. Interesuje nas system TITAN Hardcore.
Tel. 605-123-456
Pozdrawiam
Marta Zielińska`);
    expect(d).toMatchObject({ klient: 'Marta Zielińska', email: 'marta.z@example.com', telefon: '605 123 456', system: 'TITAN Hardcore' });
    expect(d.adres).toBe('ul. Sosnowa 12, 43-300 Bielsko-Biała');
    expect(d.ilosci).toEqual({ pos: 62.5, sm: 14, hy: 14, st: 15, ga: 30 });
    expect(d.uwagi).toContain('ogrzewanie podłogowe');
  });
  it('krótki SMS', () => {
    const d = wyciagnijLokalnie('Witam, ile kosztuje mikrocement na podłogę 35m² w Wadowicach? Tomek 512 000 111');
    expect(d.ilosci).toEqual({ pos: 35 });
    expect(d.telefon).toBe('512 000 111');
    expect(d.adres).toBe('Wadowicach');
  });
  it('tekst bez danych nie zmyśla wartości', () => {
    expect(wyciagnijLokalnie('Dzień dobry, proszę o kontakt.')).toMatchObject({ klient: '', telefon: '', email: '', adres: '', ilosci: {} });
  });
});
