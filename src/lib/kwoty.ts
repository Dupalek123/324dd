// Kwoty, zaokrąglenia i polskie formaty.

/** Zaokrąglenie do 0,01 (odporne na błędy zmiennoprzecinkowe, np. 1.005 → 1.01). */
export function zaokr(x: number, miejsca = 2): number {
  if (!Number.isFinite(x)) return 0;
  const m = 10 ** miejsca;
  return Math.round((x + Math.sign(x) * 1e-9) * m) / m;
}

export const bruttoZNetto = (netto: number, vat: number): number => zaokr(netto * (1 + vat / 100));
export const nettoZBrutto = (brutto: number, vat: number): number => zaokr(brutto / (1 + vat / 100));
export const kwotaVat = (netto: number, vat: number): number => zaokr(bruttoZNetto(netto, vat) - netto);

/** Przelicza trójkę netto/VAT/brutto po zmianie jednego pola. */
export function przelicz(
  zmienione: 'netto' | 'brutto' | 'vat',
  w: { netto: number; brutto: number; vat: number },
): { netto: number; brutto: number; vat: number } {
  if (zmienione === 'brutto') return { vat: w.vat, brutto: zaokr(w.brutto), netto: nettoZBrutto(w.brutto, w.vat) };
  return { vat: w.vat, netto: zaokr(w.netto), brutto: bruttoZNetto(w.netto, w.vat) };
}

/** Parsuje liczbę wpisaną po polsku: „1 234,56”, „1234.56”, „12,5 zł”. Pusty tekst → null. */
export function liczba(tekst: string | number | null | undefined): number | null {
  if (tekst === null || tekst === undefined) return null;
  if (typeof tekst === 'number') return Number.isFinite(tekst) ? tekst : null;
  const s = tekst.replace(/[\s  ]/g, '').replace(/zł|pln/gi, '').replace(',', '.');
  if (s === '' || s === '-' ) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}


/** Dzieli tysiące spacją niełamliwą także dla liczb 4-cyfrowych (Intl pomija je w pl-PL). */
function grupuj(calk: string): string {
  return calk.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function fmtLiczba(x: number | null | undefined, miejsca = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–';
  const v = zaokr(x, miejsca);
  const [c, u] = Math.abs(v).toFixed(miejsca).split('.');
  return (v < 0 ? '−' : '') + grupuj(c) + (u ? ',' + u : '');
}

/** 1234.5 → „1 234,50 zł” */
export const zl = (x: number | null | undefined): string => (x === null || x === undefined ? '–' : fmtLiczba(x, 2) + ' zł');
/** Liczba bez zbędnych zer: 12.5 → „12,5”, 12 → „12”. */
export function fmtIlosc(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–';
  const v = zaokr(x, 2);
  const s = fmtLiczba(v, 2);
  return s.replace(/,00$/, '').replace(/(,\d)0$/, '$1');
}
export const proc = (x: number | null | undefined): string => (x === null || x === undefined ? '–' : fmtLiczba(x, 1) + '%');
/** Wartość do pola formularza (przecinek dziesiętny, bez spacji). */
export const doPola = (x: number | null | undefined): string => (x === null || x === undefined ? '' : String(zaokr(x, 2)).replace('.', ','));

// ---- Daty (ISO rrrr-mm-dd w danych, dd.mm.rrrr na ekranie) ----
const p2 = (n: number) => String(n).padStart(2, '0');
export const isoData = (d: Date = new Date()): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const dzis = (): string => isoData(new Date());
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '–';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}
export function fmtCzas(ms: number): string {
  const d = new Date(ms);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export function dodajDni(iso: string, dni: number): string {
  const [r, m, d] = iso.split('-').map(Number);
  return isoData(new Date(r, m - 1, d + dni));
}
export const MIESIACE = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
export const MIES_KR = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
/** „2026-03” → „marzec 2026” */
export function fmtMiesiac(ym: string): string {
  const [r, m] = ym.split('-');
  return `${MIESIACE[Number(m) - 1] ?? m} ${r}`;
}
/** Poniedziałek tygodnia zawierającego datę. */
export function poczatekTygodnia(iso: string): string {
  const [r, m, d] = iso.split('-').map(Number);
  const dt = new Date(r, m - 1, d);
  const dzien = (dt.getDay() + 6) % 7;
  return isoData(new Date(r, m - 1, d - dzien));
}
/** Wszystko poza cyframi i literami usuwa, małe litery, bez polskich znaków – do wyszukiwania. */
export function norm(s: unknown): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}
