import { describe, expect, it } from 'vitest';
import { bruttoZNetto, nettoZBrutto, przelicz, zaokr, liczba, zl, fmtData, fmtIlosc, dodajDni, poczatekTygodnia, kwotaVat } from '../src/lib/kwoty';

describe('netto / brutto', () => {
  it('brutto = netto × (1 + VAT/100), zaokrąglone do grosza', () => {
    expect(bruttoZNetto(100, 23)).toBe(123);
    expect(bruttoZNetto(100, 8)).toBe(108);
    expect(bruttoZNetto(100, 5)).toBe(105);
    expect(bruttoZNetto(100, 0)).toBe(100);
    expect(bruttoZNetto(19.99, 23)).toBe(24.59);
    expect(bruttoZNetto(15210, 8)).toBe(16426.8);
    expect(bruttoZNetto(0.01, 23)).toBe(0.01);
  });
  it('netto z brutto', () => {
    expect(nettoZBrutto(123, 23)).toBe(100);
    expect(nettoZBrutto(108, 8)).toBe(100);
    expect(nettoZBrutto(100, 23)).toBe(81.3);
    expect(nettoZBrutto(16426.8, 8)).toBe(15210);
    expect(nettoZBrutto(50, 0)).toBe(50);
  });
  it('zaokrąglenie nie gubi połówek groszy (błędy zmiennoprzecinkowe)', () => {
    expect(zaokr(1.005)).toBe(1.01);
    expect(zaokr(2.675)).toBe(2.68);
    expect(zaokr(-1.005)).toBe(-1.01);
    expect(zaokr(0.1 + 0.2)).toBe(0.3);
    expect(zaokr(NaN)).toBe(0);
  });
  it('wpisanie jednej kwoty wylicza drugą', () => {
    expect(przelicz('netto', { netto: 1000, brutto: 0, vat: 8 })).toEqual({ netto: 1000, brutto: 1080, vat: 8 });
    expect(przelicz('brutto', { netto: 0, brutto: 1230, vat: 23 })).toEqual({ netto: 1000, brutto: 1230, vat: 23 });
    // zmiana stawki VAT zachowuje netto i przelicza brutto
    expect(przelicz('vat', { netto: 1000, brutto: 1080, vat: 23 })).toEqual({ netto: 1000, brutto: 1230, vat: 23 });
  });
  it('netto → brutto → netto wraca do tej samej kwoty dla każdej stawki', () => {
    for (const vat of [23, 8, 5, 0]) for (const netto of [0.01, 1, 9.99, 123.45, 15210, 99999.99]) {
      expect(nettoZBrutto(bruttoZNetto(netto, vat), vat)).toBe(netto);
    }
  });
  it('kwota VAT', () => { expect(kwotaVat(200, 23)).toBe(46); });
});

describe('formaty polskie', () => {
  it('parsuje liczby z przecinkiem i spacjami', () => {
    expect(liczba('1 234,56')).toBe(1234.56);
    expect(liczba('12,5 zł')).toBe(12.5);
    expect(liczba('12.5')).toBe(12.5);
    expect(liczba('')).toBeNull();
    expect(liczba('abc')).toBeNull();
  });
  it('formatuje kwoty i daty', () => {
    expect(zl(1234.5)).toBe('1 234,50 zł');
    expect(zl(-50)).toBe('−50,00 zł');
    expect(zl(1234567.891)).toBe('1 234 567,89 zł');
    expect(fmtData('2026-03-07')).toBe('07.03.2026');
    expect(fmtIlosc(12.5)).toBe('12,5');
    expect(fmtIlosc(12)).toBe('12');
    expect(fmtIlosc(0.25)).toBe('0,25');
  });
  it('daty', () => {
    expect(dodajDni('2026-01-30', 3)).toBe('2026-02-02');
    expect(poczatekTygodnia('2026-11-15')).toBe('2026-11-09'); // niedziela → poniedziałek
    expect(poczatekTygodnia('2026-11-09')).toBe('2026-11-09');
  });
});
