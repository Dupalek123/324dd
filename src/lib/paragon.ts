// Dane odczytane z paragonu / faktury i przeliczenie ich na kwoty kosztu (netto liczone osobno dla każdej stawki VAT).
import { nettoZBrutto, zaokr } from './kwoty';
import { KATEGORIE, STAWKI_VAT, type Kategoria, type Vat } from './typy';

export interface PozycjaParagonu { nazwa: string; ilosc: number; wartosc_brutto: number; vat: number }
export interface DaneParagonu {
  czy_paragon: boolean;
  data: string;
  sprzedawca: string;
  nip: string;
  numer: string;
  kategoria: Kategoria | null;
  pozycje: PozycjaParagonu[];
  razem_brutto: number;
}

const tekst = (x: unknown): string => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '');
const liczba = (x: unknown): number => { const n = typeof x === 'number' ? x : Number(String(x ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

/** Porządkuje odpowiedź serwera: nie ufamy ani typom, ani zakresom. */
export function normalizujParagon(o: unknown): DaneParagonu {
  const r = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
  const pozycje = (Array.isArray(r.pozycje) ? r.pozycje : []).map((p: Record<string, unknown>) => ({
    nazwa: tekst(p?.nazwa), ilosc: liczba(p?.ilosc) || 1, wartosc_brutto: zaokr(liczba(p?.wartosc_brutto)), vat: liczba(p?.vat),
  })).filter((p) => p.nazwa && p.wartosc_brutto !== 0);
  const kat = KATEGORIE.find((k) => k === r.kategoria) ?? null;
  return {
    czy_paragon: r.czy_paragon !== false, data: tekst(r.data), sprzedawca: tekst(r.sprzedawca), nip: tekst(r.nip).replace(/[^\d]/g, ''), numer: tekst(r.numer),
    kategoria: kat, pozycje, razem_brutto: zaokr(liczba(r.razem_brutto)),
  };
}

/** Poprawna data w formacie RRRR-MM-DD albo null (nie zgadujemy). */
export function dataParagonu(s: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return s.trim();
}

export interface GrupaVat { vat: Vat; brutto: number; netto: number }
export interface SumyParagonu {
  netto: number;
  brutto: number;
  /** Stawka o największej wartości – trafia do pola VAT kosztu. */
  vat: Vat;
  grupy: GrupaVat[];
  /** Różnica między sumą na paragonie a sumą pozycji (rabaty, nieodczytane pozycje); 0 gdy się zgadza. */
  rozbieznosc: number;
}

/**
 * Netto = suma netto liczonych osobno dla każdej stawki (tak jak na paragonie, z podsumowaniem PTU),
 * a nie jedno przeliczenie całości jedną stawką. Brak stawki przy pozycji → stawka domyślna.
 */
export function sumyParagonu(d: Pick<DaneParagonu, 'pozycje' | 'razem_brutto'>, domyslnyVat: Vat): SumyParagonu {
  const stawka = (v: number): Vat => ((STAWKI_VAT as number[]).includes(v) ? (v as Vat) : domyslnyVat);
  const mapa = new Map<Vat, number>();
  for (const p of d.pozycje) { const v = stawka(p.vat); mapa.set(v, zaokr((mapa.get(v) ?? 0) + p.wartosc_brutto)); }
  const sumaPoz = zaokr([...mapa.values()].reduce((a, b) => a + b, 0));
  const razem = d.razem_brutto > 0 ? d.razem_brutto : sumaPoz;
  const roznica = d.pozycje.length ? zaokr(razem - sumaPoz) : razem;
  let dominujaca = domyslnyVat, max = -Infinity;
  for (const [v, b] of mapa) if (b > max) { max = b; dominujaca = v; }
  if (roznica !== 0) mapa.set(dominujaca, zaokr((mapa.get(dominujaca) ?? 0) + roznica));
  const grupy = [...mapa.entries()].map(([vat, brutto]) => ({ vat, brutto, netto: nettoZBrutto(brutto, vat) })).sort((a, b) => b.brutto - a.brutto);
  return {
    netto: zaokr(grupy.reduce((a, g) => a + g.netto, 0)), brutto: zaokr(grupy.reduce((a, g) => a + g.brutto, 0)),
    vat: dominujaca, grupy, rozbieznosc: d.pozycje.length ? roznica : 0,
  };
}

/** Krótki opis kosztu z nazw pozycji. */
export function opisParagonu(d: Pick<DaneParagonu, 'pozycje'>, maks = 180): string {
  const nazwy = d.pozycje.map((p) => p.nazwa);
  let s = nazwy.slice(0, 4).join(', ') + (nazwy.length > 4 ? ` … (+${nazwy.length - 4})` : '');
  if (s.length > maks) s = s.slice(0, maks - 1).trimEnd() + '…';
  return s;
}
