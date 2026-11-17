import { describe, expect, it } from 'vitest';
import { dataParagonu, normalizujParagon, opisParagonu, sumyParagonu } from '../src/lib/paragon';

const poz = (nazwa: string, wartosc_brutto: number, vat: number, ilosc = 1) => ({ nazwa, ilosc, wartosc_brutto, vat });

describe('sumy z paragonu', () => {
  it('jedna stawka: netto z brutto', () => {
    const s = sumyParagonu({ pozycje: [poz('Grunt', 123, 23), poz('Wałek', 61.5, 23)], razem_brutto: 184.5 }, 23);
    expect(s).toMatchObject({ brutto: 184.5, netto: 150, vat: 23, rozbieznosc: 0 });
  });
  it('różne stawki liczone osobno, jak w podsumowaniu PTU', () => {
    // 123 zł @23% → 100,00 netto; 108 zł @8% → 100,00 netto
    const s = sumyParagonu({ pozycje: [poz('Mikrocement', 123, 23), poz('Folia', 108, 8)], razem_brutto: 231 }, 23);
    expect(s.netto).toBe(200);
    expect(s.brutto).toBe(231);
    expect(s.grupy.map((g) => [g.vat, g.brutto, g.netto])).toEqual([[23, 123, 100], [8, 108, 100]]);
    expect(s.vat).toBe(23);
  });
  it('liczy netto na grupach, a nie na pojedynczych pozycjach (zaokrąglenia)', () => {
    const s = sumyParagonu({ pozycje: [poz('A', 0.5, 23), poz('B', 0.5, 23), poz('C', 0.5, 23)], razem_brutto: 1.5 }, 23);
    expect(s.netto).toBe(1.22); // 1,50 / 1,23, a nie 3 × 0,41
  });
  it('brak stawki przy pozycji → stawka domyślna', () => {
    expect(sumyParagonu({ pozycje: [poz('Coś', 123, -1)], razem_brutto: 123 }, 23)).toMatchObject({ netto: 100, vat: 23 });
    expect(sumyParagonu({ pozycje: [poz('Coś', 108, 99)], razem_brutto: 108 }, 8)).toMatchObject({ netto: 100, vat: 8 });
  });
  it('suma na paragonie ma pierwszeństwo, a różnica jest zgłaszana (np. rabat)', () => {
    const s = sumyParagonu({ pozycje: [poz('A', 100, 23), poz('B', 50, 23)], razem_brutto: 140 }, 23);
    expect(s.brutto).toBe(140);
    expect(s.rozbieznosc).toBe(-10);
    expect(s.netto).toBe(113.82);
  });
  it('bez pozycji, tylko suma', () => {
    expect(sumyParagonu({ pozycje: [], razem_brutto: 246 }, 23)).toMatchObject({ brutto: 246, netto: 200, rozbieznosc: 0 });
  });
  it('bez sumy – liczy z pozycji; pusty paragon daje zero', () => {
    expect(sumyParagonu({ pozycje: [poz('A', 12.3, 23)], razem_brutto: 0 }, 23)).toMatchObject({ brutto: 12.3, netto: 10 });
    expect(sumyParagonu({ pozycje: [], razem_brutto: 0 }, 23)).toMatchObject({ brutto: 0, netto: 0 });
  });
  it('rabat jako pozycja ujemna', () => {
    const s = sumyParagonu({ pozycje: [poz('Farba', 200, 23), poz('Rabat', -20, 23)], razem_brutto: 180 }, 23);
    expect(s).toMatchObject({ brutto: 180, rozbieznosc: 0 });
  });
});

describe('porządkowanie odpowiedzi', () => {
  it('odporne na śmieci i złe typy', () => {
    const d = normalizujParagon({ czy_paragon: true, data: ' 2026-03-07 ', sprzedawca: '  Castorama   Polska ', nip: '123-456-78-90', kategoria: 'Narzędzia', razem_brutto: '184,5',
      pozycje: [{ nazwa: ' Wałek ', ilosc: '2', wartosc_brutto: '61,50', vat: '23' }, { nazwa: '', wartosc_brutto: 5 }, { nazwa: 'Zero', wartosc_brutto: 0 }, null] });
    expect(d).toMatchObject({ data: '2026-03-07', sprzedawca: 'Castorama Polska', nip: '1234567890', kategoria: 'Narzędzia', razem_brutto: 184.5 });
    expect(d.pozycje).toEqual([{ nazwa: 'Wałek', ilosc: 2, wartosc_brutto: 61.5, vat: 23 }]);
    expect(normalizujParagon(null)).toMatchObject({ pozycje: [], razem_brutto: 0, kategoria: null, czy_paragon: true });
    expect(normalizujParagon({ kategoria: 'Coś' }).kategoria).toBeNull();
    expect(normalizujParagon({ czy_paragon: false }).czy_paragon).toBe(false);
  });
  it('data tylko poprawna', () => {
    expect(dataParagonu('2026-03-07')).toBe('2026-03-07');
    expect(dataParagonu('2026-02-30')).toBeNull();
    expect(dataParagonu('07.03.2026')).toBeNull();
    expect(dataParagonu('')).toBeNull();
  });
  it('opis z nazw pozycji', () => {
    expect(opisParagonu({ pozycje: [poz('Grunt', 1, 23), poz('Wałek', 1, 23)] })).toBe('Grunt, Wałek');
    expect(opisParagonu({ pozycje: ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => poz(n, 1, 23)) })).toBe('A, B, C, D … (+2)');
    expect(opisParagonu({ pozycje: [] })).toBe('');
    expect(opisParagonu({ pozycje: [poz('x'.repeat(300), 1, 23)] }).length).toBe(180);
  });
});
