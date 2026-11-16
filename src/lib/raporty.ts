// Agregacje do pulpitu i raportów.
import { zaokr } from './kwoty';
import { dataZlecenia, podzialZysku, wynikZlecenia } from './obliczenia';
import type { Klient, Koszt, OsobaId, Ustawienia, WpisGodzin, Zlecenie } from './typy';

const zywe = <T extends { usuniety?: boolean }>(l: T[]): T[] => l.filter((x) => !x.usuniety);

export interface WierszOkresu {
  okres: string;
  zlecen: number;
  przychod: number;
  koszty: number;
  /** Koszty ogólne firmy z tego okresu, których nie rozksięgowano na zlecenia. */
  ogolne: number;
  wynik: number;
  marza: number;
  wlasciciel: number;
  wspolnik: number;
  godzWlasciciel: number;
  godzWspolnik: number;
  km: number;
  litry: number;
  paliwo: number;
}

const pusty = (okres: string): WierszOkresu => ({ okres, zlecen: 0, przychod: 0, koszty: 0, ogolne: 0, wynik: 0, marza: 0, wlasciciel: 0, wspolnik: 0, godzWlasciciel: 0, godzWspolnik: 0, km: 0, litry: 0, paliwo: 0 });

export interface DaneRaportu { zlecenia: Zlecenie[]; koszty: Koszt[]; godziny: WpisGodzin[]; klienci: Klient[]; ust: Pick<Ustawienia, 'udzial' | 'stawka'> }

/** Zlecenia brane do raportu: zakończone (i opcjonalnie w realizacji). */
export const doRaportu = (z: Zlecenie, zWRealizacji: boolean): boolean =>
  !z.usuniety && (z.status === 'Zakończone' || (zWRealizacji && z.status === 'W realizacji'));

/** Przychód, koszty i wynik w okresach. `dlugosc` = 7 → miesiące (rrrr-mm), 4 → lata. */
export function raportOkresowy(d: DaneRaportu, dlugosc: 4 | 7, zWRealizacji = false): WierszOkresu[] {
  const mapa = new Map<string, WierszOkresu>();
  const w = (okres: string) => { let x = mapa.get(okres); if (!x) { x = pusty(okres); mapa.set(okres, x); } return x; };
  for (const z of d.zlecenia) {
    if (!doRaportu(z, zWRealizacji)) continue;
    const x = w(dataZlecenia(z).slice(0, dlugosc));
    const wyn = wynikZlecenia(z, d.koszty);
    const p = podzialZysku(z, wyn.wynik, d.godziny, d.ust);
    x.zlecen++; x.przychod += wyn.przychod; x.koszty += wyn.koszty; x.wynik += wyn.wynik;
    x.wlasciciel += p.kwoty.wlasciciel; x.wspolnik += p.kwoty.wspolnik;
  }
  for (const k of zywe(d.koszty)) {
    if (!k.data) continue;
    const x = w(k.data.slice(0, dlugosc));
    if (k.ogolny || !k.zlecenieId) {
      const rozdz = (k.rozdzial ?? []).reduce((a, r) => a + r.netto, 0);
      const reszta = (k.netto || 0) - rozdz;
      x.ogolne += reszta; x.wynik -= reszta;
    }
    if (k.dojazd) { x.km += k.dojazd.km || 0; x.litry += k.dojazd.litry || 0; }
    if (k.dojazd || k.kategoria === 'Paliwo') x.paliwo += k.netto || 0;
  }
  for (const g of zywe(d.godziny)) {
    if (!g.data) continue;
    const x = w(g.data.slice(0, dlugosc));
    if (g.osoba === 'wspolnik') x.godzWspolnik += g.godziny || 0; else x.godzWlasciciel += g.godziny || 0;
  }
  return [...mapa.values()].sort((a, b) => a.okres.localeCompare(b.okres)).map((x) => {
    const r = { ...x };
    for (const k of Object.keys(r) as (keyof WierszOkresu)[]) if (typeof r[k] === 'number') (r[k] as number) = zaokr(r[k] as number);
    r.marza = r.przychod ? zaokr((r.wynik / r.przychod) * 100, 1) : 0;
    return r;
  });
}

export interface WierszGrupy { nazwa: string; zlecen: number; m2: number; przychod: number; koszty: number; wynik: number; marza: number }

function grupuj(d: DaneRaportu, klucz: (z: Zlecenie) => string, zWRealizacji: boolean): WierszGrupy[] {
  const mapa = new Map<string, WierszGrupy>();
  for (const z of d.zlecenia) {
    if (!doRaportu(z, zWRealizacji)) continue;
    const nazwa = klucz(z) || '(brak)';
    let x = mapa.get(nazwa);
    if (!x) { x = { nazwa, zlecen: 0, m2: 0, przychod: 0, koszty: 0, wynik: 0, marza: 0 }; mapa.set(nazwa, x); }
    const wyn = wynikZlecenia(z, d.koszty);
    x.zlecen++; x.m2 += z.m2 || 0; x.przychod += wyn.przychod; x.koszty += wyn.koszty; x.wynik += wyn.wynik;
  }
  return [...mapa.values()].map((x) => ({
    ...x, m2: zaokr(x.m2), przychod: zaokr(x.przychod), koszty: zaokr(x.koszty), wynik: zaokr(x.wynik),
    marza: x.przychod ? zaokr((x.wynik / x.przychod) * 100, 1) : 0,
  })).sort((a, b) => b.przychod - a.przychod);
}

export const raportSystemow = (d: DaneRaportu, zWR = false) => grupuj(d, (z) => z.system, zWR);
export const raportTypowPrac = (d: DaneRaportu, zWR = false) => grupuj(d, (z) => z.typPrac, zWR);
export function raportZrodel(d: DaneRaportu, zWR = false): WierszGrupy[] {
  const zrodla = new Map(d.klienci.map((k) => [k.id, k.zrodlo]));
  return grupuj(d, (z) => (z.klientId && zrodla.get(z.klientId)) || '(nie podano)', zWR);
}

/** Dane pulpitu. */
export function pulpit(d: DaneRaportu, miesiac: string) {
  const zl = zywe(d.zlecenia);
  const wToku = zl.filter((z) => z.status === 'W realizacji' || z.status === 'Zaakceptowane');
  const aktywne = zl.filter((z) => z.status !== 'Oferta');
  let wartosc = 0, koszty = 0, wynik = 0;
  for (const z of aktywne) { const w = wynikZlecenia(z, d.koszty); wartosc += w.przychod; koszty += w.koszty; wynik += w.wynik; }
  const zak = { przychod: 0, koszty: 0, wynik: 0, marza: 0, wlasciciel: 0, wspolnik: 0, liczba: 0 };
  for (const z of zl.filter((x) => x.status === 'Zakończone')) {
    const w = wynikZlecenia(z, d.koszty);
    const p = podzialZysku(z, w.wynik, d.godziny, d.ust);
    zak.liczba++; zak.przychod += w.przychod; zak.koszty += w.koszty; zak.wynik += w.wynik;
    zak.wlasciciel += p.kwoty.wlasciciel; zak.wspolnik += p.kwoty.wspolnik;
  }
  for (const k of ['przychod', 'koszty', 'wynik', 'wlasciciel', 'wspolnik'] as const) zak[k] = zaokr(zak[k]);
  zak.marza = zak.przychod ? zaokr((zak.wynik / zak.przychod) * 100, 1) : 0;
  const godz: Record<OsobaId, number> = { wlasciciel: 0, wspolnik: 0 };
  for (const g of zywe(d.godziny)) if (g.data?.startsWith(miesiac) && g.osoba in godz) godz[g.osoba] += g.godziny || 0;
  return {
    wToku: wToku.map((z) => ({ zlecenie: z, wynik: wynikZlecenia(z, d.koszty) })),
    wartosc: zaokr(wartosc), koszty: zaokr(koszty), wynik: zaokr(wynik), zakonczone: zak,
    godziny: { wlasciciel: zaokr(godz.wlasciciel), wspolnik: zaokr(godz.wspolnik), razem: zaokr(godz.wlasciciel + godz.wspolnik) },
  };
}
