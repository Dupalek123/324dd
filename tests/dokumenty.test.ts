import { describe, expect, it } from 'vitest';
import { CENNIK, domyslneUstawienia } from '../src/lib/domyslne';
import { kwotaSlownie, liczbaSlownie } from '../src/lib/slownie';
import type { Dokument, Oferta, Ustawienia } from '../src/lib/typy';
import { dokumentPdf, ofertaPdf, trescDokumentu, wypelnij } from '../src/pdf/dokumenty';

const ust = { id: 'glowne', _ts: {}, _zm: 0, utworzono: 0, utworzyl: 'wlasciciel', ...domyslneUstawienia() } as Ustawienia;
const oferta: Oferta = {
  id: 'o', _ts: {}, _zm: 0, utworzono: 0, utworzyl: 'wlasciciel', nr: 'BF/2026/007', data: '2026-03-01', klient: 'Żaneta Świątek', telefon: '600 100 200', email: '', adres: 'ul. Źródlana 3, Żywiec',
  system: 'TITAN Standard', vat: 8, niestandardowe: true, pozycje: CENNIK.map((c) => ({ ...c, ilosc: ({ pos: 40, hy: 12.5 } as Record<string, number>)[c.klucz] ?? null })),
  dni: 7, startDni: 14, zaliczka: 20, waznosc: 14, uwagi: 'Kolor: ciepła szarość', status: 'robocza',
};
const tekst = (x: unknown) => JSON.stringify(x);

describe('PDF oferty', () => {
  const def = ofertaPdf(oferta, ust);
  const t = tekst(def);
  it('zawiera numer, klienta z polskimi znakami i tylko wybrane pozycje', () => {
    expect(t).toContain('BF/2026/007');
    expect(t).toContain('Żaneta Świątek');
    expect(t).toContain('ul. Źródlana 3, Żywiec');
    expect(t).toContain('Posadzki dekoracyjne (niestandardowe)');
    expect(t).toContain('Hydroizolacja ścian strefy mokrej');
    expect(t).not.toContain('Schody');
  });
  it('sumy netto, VAT i brutto zgadzają się z obliczeniami', () => {
    // 40 × 410 + 12,5 × 120 = 17 900; VAT 8% = 1 432; brutto 19 332
    expect(t).toContain('17 900,00 zł');
    expect(t).toContain('1 432,00 zł');
    expect(t).toContain('19 332,00 zł');
    expect(t).toContain('VAT 8%');
  });
  it('warunki wypełniają się parametrami oferty', () => {
    expect(t).toContain('7 dni roboczych');
    expect(t).toContain('do 14 dni od podpisania umowy');
    expect(t).toContain('20% wartości brutto');
    expect(t).toContain('do 15.03.2026');
    expect(t).toContain('Kolor: ciepła szarość');
    expect(t).not.toContain('{{');
  });
});

describe('szablony dokumentów', () => {
  it('wstawia zmienne, a brakujące zostawia do wypełnienia', () => {
    expect(wypelnij('Klient: {{klient}}, kwota {{ kwota }}, {{nieznane}}', { klient: 'Jan', kwota: 5 })).toBe('Klient: Jan, kwota 5, ..........');
  });
  it('potwierdzenie zaliczki z kwotą słownie', () => {
    const d = { id: 'd', typ: 'zaliczka', nr: 'Z/2026/001', data: '2026-03-05', klient: 'Jan Kowalski', adres: 'Wadowice', zlecenieId: null, pola: { kwota: '2 160,00 zł', forma: 'przelew', zakres: 'Podłoga', brutto: '10 800,00 zł', pozostalo: '8 640,00 zł' } } as unknown as Dokument;
    const t = trescDokumentu(d, ust);
    expect(t).toContain('dwa tysiące sto sześćdziesiąt złotych 00/100');
    expect(t).toContain('Jan Kowalski');
    expect(tekst(dokumentPdf(d, ust))).toContain('Potwierdzenie zaliczki');
  });
  it('każdy typ dokumentu buduje się bez niewypełnionych klamer', () => {
    for (const typ of ['umowa', 'protokol', 'pielegnacja', 'zaliczka', 'proforma'] as const) {
      const d = { id: 'd', typ, nr: 'X/1', data: '2026-03-05', klient: 'A', adres: 'B', zlecenieId: null, pola: {} } as unknown as Dokument;
      expect(tekst(dokumentPdf(d, ust))).not.toContain('{{');
    }
  });
  it('liczby słownie', () => {
    expect(liczbaSlownie(0)).toBe('zero');
    expect(liczbaSlownie(15)).toBe('piętnaście');
    expect(liczbaSlownie(1000)).toBe('tysiąc');
    expect(liczbaSlownie(2022)).toBe('dwa tysiące dwadzieścia dwa');
    expect(liczbaSlownie(5300)).toBe('pięć tysięcy trzysta');
    expect(liczbaSlownie(12000)).toBe('dwanaście tysięcy');
    expect(liczbaSlownie(1250000)).toBe('milion dwieście pięćdziesiąt tysięcy');
    expect(kwotaSlownie(1.5)).toBe('jeden złoty 50/100');
    expect(kwotaSlownie(22.07)).toBe('dwadzieścia dwa złote 07/100');
    expect(kwotaSlownie(1500)).toBe('jeden tysiąc pięćset złotych 00/100');
  });
});
