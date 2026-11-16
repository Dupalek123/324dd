// Zasady biznesowe (sekcja 4): wynik zlecenia, rozliczenie wspólników, dojazdy, numeracja, materiały.
// Wyłącznie czyste funkcje – pokryte testami w tests/.
import { zaokr, nettoZBrutto } from './kwoty';
import {
  drugaOsoba, KATEGORIE, type Kategoria, type Koszt, type OsobaId, type Oferta, type PozycjaOferty,
  type Ustawienia, type WarstwaZuzycia, type WpisGodzin, type Wyplata, type Zlecenie,
} from './typy';

const zywe = <T extends { usuniety?: boolean }>(l: T[]): T[] => l.filter((x) => !x.usuniety);

// ---------- Wynik zlecenia ----------
export interface Wynik {
  przychod: number;
  koszty: number;
  /** Koszty bezpośrednie wg kategorii (netto). */
  wgKategorii: Record<Kategoria, number>;
  /** Część kosztów ogólnych firmy rozksięgowana na to zlecenie. */
  ogolne: number;
  kosztyBrutto: number;
  wynik: number;
  /** Marża w % przychodu netto. */
  marza: number;
}

/** Wynik zlecenia = przychód netto − suma kosztów netto (bezpośrednich i rozksięgowanych). */
export function wynikZlecenia(z: Pick<Zlecenie, 'id' | 'netto'>, koszty: Koszt[]): Wynik {
  const wgKategorii = Object.fromEntries(KATEGORIE.map((k) => [k, 0])) as Record<Kategoria, number>;
  let ogolne = 0;
  let kosztyBrutto = 0;
  for (const k of zywe(koszty)) {
    if (k.zlecenieId === z.id && !k.ogolny) {
      const kat = (KATEGORIE as readonly string[]).includes(k.kategoria) ? k.kategoria : 'Inne';
      wgKategorii[kat] = zaokr(wgKategorii[kat] + (k.netto || 0));
      kosztyBrutto += k.brutto || 0;
    } else if (k.rozdzial?.length) {
      for (const r of k.rozdzial) {
        if (r.zlecenieId === z.id) {
          ogolne += r.netto || 0;
          kosztyBrutto += k.netto ? (r.netto / k.netto) * (k.brutto || 0) : 0;
        }
      }
    }
  }
  ogolne = zaokr(ogolne);
  const suma = zaokr(Object.values(wgKategorii).reduce((a, b) => a + b, 0) + ogolne);
  const przychod = zaokr(z.netto || 0);
  const wynik = zaokr(przychod - suma);
  return {
    przychod, koszty: suma, wgKategorii, ogolne, kosztyBrutto: zaokr(kosztyBrutto), wynik,
    marza: przychod ? zaokr((wynik / przychod) * 100, 1) : 0,
  };
}

// ---------- Rozliczenie wspólników ----------
export interface Podzial {
  tryb: 'razem' | 'godz';
  klientOd: OsobaId;
  /** Procent osoby z pola „Klient od” (tryb RAZEM). */
  udzial: number;
  /** Stawka pomocnika (tryb SAM + POMOC). */
  stawka: number;
  godziny: Record<OsobaId, number>;
  /** Wynagrodzenie pomocnika w trybie godzinowym. */
  pomoc: number;
  kwoty: Record<OsobaId, number>;
}

export function godzinyZlecenia(zlecenieId: string, godziny: WpisGodzin[]): Record<OsobaId, number> {
  const g: Record<OsobaId, number> = { wlasciciel: 0, wspolnik: 0 };
  for (const w of zywe(godziny)) if (w.zlecenieId === zlecenieId && w.osoba in g) g[w.osoba] += w.godziny || 0;
  return { wlasciciel: zaokr(g.wlasciciel), wspolnik: zaokr(g.wspolnik) };
}

/**
 * RAZEM: osoba z pola „Klient od” bierze X% wyniku, druga (100 − X)%.
 * SAM + POMOC GODZINOWA: „Klient od” bierze wynik minus (godziny pomocnika × stawka).
 */
export function podzialZysku(
  z: Pick<Zlecenie, 'id' | 'klientOd' | 'tryb' | 'udzial' | 'stawka'>,
  wynik: number,
  godziny: WpisGodzin[],
  ust: Pick<Ustawienia, 'udzial' | 'stawka'>,
): Podzial {
  const od: OsobaId = z.klientOd === 'wspolnik' ? 'wspolnik' : 'wlasciciel';
  const drugi = drugaOsoba(od);
  const g = godzinyZlecenia(z.id, godziny);
  const udzial = z.udzial ?? ust.udzial ?? 60;
  const stawka = z.stawka ?? ust.stawka ?? 0;
  const kwoty: Record<OsobaId, number> = { wlasciciel: 0, wspolnik: 0 };
  let pomoc = 0;
  if (z.tryb === 'godz') {
    pomoc = zaokr(g[drugi] * stawka);
    kwoty[drugi] = pomoc;
    kwoty[od] = zaokr(wynik - pomoc);
  } else {
    kwoty[od] = zaokr((wynik * udzial) / 100);
    kwoty[drugi] = zaokr(wynik - kwoty[od]);
  }
  return { tryb: z.tryb === 'godz' ? 'godz' : 'razem', klientOd: od, udzial, stawka, godziny: g, pomoc, kwoty };
}

export interface FiltrRozliczenia {
  status: 'wszystkie' | 'zakonczone' | 'w_realizacji';
  od?: string | null;
  do?: string | null;
}

/** Data, do której zlecenie należy w raportach i filtrach. */
export const dataZlecenia = (z: Zlecenie): string =>
  z.dataKoniec || z.dataStart || new Date(z.utworzono || 0).toISOString().slice(0, 10);

export function filtrujZlecenia(zlecenia: Zlecenie[], f: FiltrRozliczenia): Zlecenie[] {
  return zywe(zlecenia).filter((z) => {
    if (f.status === 'zakonczone' && z.status !== 'Zakończone') return false;
    if (f.status === 'w_realizacji' && z.status !== 'W realizacji') return false;
    if (f.status === 'wszystkie' && z.status === 'Oferta') return false;
    const d = dataZlecenia(z);
    if (f.od && d < f.od) return false;
    if (f.do && d > f.do) return false;
    return true;
  });
}

export interface WierszRozliczenia { zlecenie: Zlecenie; wynik: Wynik; podzial: Podzial; wyplacono: Record<OsobaId, number> }
export interface Rozliczenie {
  wiersze: WierszRozliczenia[];
  suma: Record<OsobaId, number>;
  godziny: Record<OsobaId, number>;
  wynik: number;
  przychod: number;
  koszty: number;
}

export function rozliczenie(
  zlecenia: Zlecenie[], koszty: Koszt[], godziny: WpisGodzin[], wyplaty: Wyplata[],
  ust: Pick<Ustawienia, 'udzial' | 'stawka'>, filtr: FiltrRozliczenia,
): Rozliczenie {
  const suma: Record<OsobaId, number> = { wlasciciel: 0, wspolnik: 0 };
  const sumaG: Record<OsobaId, number> = { wlasciciel: 0, wspolnik: 0 };
  let wynik = 0, przychod = 0, kosztyS = 0;
  const wiersze = filtrujZlecenia(zlecenia, filtr).map((z) => {
    const w = wynikZlecenia(z, koszty);
    const p = podzialZysku(z, w.wynik, godziny, ust);
    const wyplacono: Record<OsobaId, number> = { wlasciciel: 0, wspolnik: 0 };
    for (const wp of zywe(wyplaty)) if (wp.zlecenieId === z.id && wp.osoba in wyplacono) wyplacono[wp.osoba] = zaokr(wyplacono[wp.osoba] + wp.kwota);
    for (const o of ['wlasciciel', 'wspolnik'] as OsobaId[]) { suma[o] = zaokr(suma[o] + p.kwoty[o]); sumaG[o] = zaokr(sumaG[o] + p.godziny[o]); }
    wynik = zaokr(wynik + w.wynik); przychod = zaokr(przychod + w.przychod); kosztyS = zaokr(kosztyS + w.koszty);
    return { zlecenie: z, wynik: w, podzial: p, wyplacono };
  });
  return { wiersze, suma, godziny: sumaG, wynik, przychod, koszty: kosztyS };
}

/** Saldo do wypłaty = należne z zakończonych zleceń − wszystkie wypłaty danej osoby. */
export function saldo(
  zlecenia: Zlecenie[], koszty: Koszt[], godziny: WpisGodzin[], wyplaty: Wyplata[], ust: Pick<Ustawienia, 'udzial' | 'stawka'>,
): Record<OsobaId, { nalezne: number; wyplacono: number; saldo: number }> {
  const r = rozliczenie(zlecenia, koszty, godziny, wyplaty, ust, { status: 'zakonczone' });
  const wynik = {} as Record<OsobaId, { nalezne: number; wyplacono: number; saldo: number }>;
  for (const o of ['wlasciciel', 'wspolnik'] as OsobaId[]) {
    const wyplacono = zaokr(zywe(wyplaty).filter((w) => w.osoba === o).reduce((a, w) => a + (w.kwota || 0), 0));
    wynik[o] = { nalezne: r.suma[o], wyplacono, saldo: zaokr(r.suma[o] - wyplacono) };
  }
  return wynik;
}

/** Orientacyjny szacunek obciążeń – wszystkie parametry podaje użytkownik. */
export function szacunekPodatkow(dochod: number, miesiecy: number, p: Ustawienia['podatki']) {
  const podstawa = Math.max(0, dochod);
  const podatek = zaokr((podstawa * (p.podatekProc || 0)) / 100);
  const zdrowotna = zaokr((podstawa * (p.zdrowotnaProc || 0)) / 100);
  const zus = zaokr((p.zusMies || 0) * Math.max(0, miesiecy));
  return { podatek, zdrowotna, zus, razem: zaokr(podatek + zdrowotna + zus), naReke: zaokr(dochod - podatek - zdrowotna - zus) };
}

// ---------- Dojazdy ----------
export interface WynikDojazdu { km: number; litry: number; kosztPaliwa: number; kosztEksploatacji: number; razem: number }

/**
 * km razem = dni × km w jedną stronę × (2 jeśli tam i z powrotem);
 * litry = km × spalanie / 100; koszt paliwa = litry × cena; opcjonalnie + km × zł/km.
 */
export function kalkulatorDojazdu(p: { dni: number; kmJednaStrona: number; tamIPowrot: boolean; spalanie: number; cenaPaliwa: number; zlKm?: number }): WynikDojazdu {
  const km = zaokr(Math.max(0, p.dni || 0) * Math.max(0, p.kmJednaStrona || 0) * (p.tamIPowrot ? 2 : 1), 1);
  const litry = zaokr((km * Math.max(0, p.spalanie || 0)) / 100);
  const kosztPaliwa = zaokr(litry * Math.max(0, p.cenaPaliwa || 0));
  const kosztEksploatacji = zaokr(km * Math.max(0, p.zlKm || 0));
  return { km, litry, kosztPaliwa, kosztEksploatacji, razem: zaokr(kosztPaliwa + kosztEksploatacji) };
}

export function sumaDojazdow(koszty: Koszt[]): { km: number; litry: number; netto: number; brutto: number; liczba: number } {
  const s = { km: 0, litry: 0, netto: 0, brutto: 0, liczba: 0 };
  for (const k of zywe(koszty)) if (k.dojazd) {
    s.km += k.dojazd.km || 0; s.litry += k.dojazd.litry || 0; s.netto += k.netto || 0; s.brutto += k.brutto || 0; s.liczba++;
  }
  return { km: zaokr(s.km, 1), litry: zaokr(s.litry), netto: zaokr(s.netto), brutto: zaokr(s.brutto), liczba: s.liczba };
}

// ---------- Oferty ----------
/** Kolejny numer oferty w formacie BF/rok/numer (np. BF/2026/007). */
export function nastepnyNumer(istniejace: string[], rok: number, prefiks = 'BF'): string {
  let max = 0;
  const wzor = new RegExp(`^${prefiks}/${rok}/(\\d+)$`);
  for (const nr of istniejace) {
    const m = wzor.exec((nr || '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefiks}/${rok}/${String(max + 1).padStart(3, '0')}`;
}

export const cenaPozycji = (p: PozycjaOferty, niestandardowe: boolean): number => {
  const alt = p.altGlobalny ? niestandardowe : !!p.wariant;
  return alt && p.cenaAlt != null ? p.cenaAlt : p.cena;
};
export const wybranePozycje = (o: Pick<Oferta, 'pozycje'>): PozycjaOferty[] => (o.pozycje || []).filter((p) => p.ilosc != null && p.ilosc > 0);

export function sumaOferty(o: Pick<Oferta, 'pozycje' | 'niestandardowe' | 'vat'>) {
  const wiersze = wybranePozycje(o).map((p) => {
    const cena = cenaPozycji(p, o.niestandardowe);
    return { pozycja: p, cena, wartosc: zaokr((p.ilosc || 0) * cena) };
  });
  const netto = zaokr(wiersze.reduce((a, w) => a + w.wartosc, 0));
  const vat = zaokr((netto * o.vat) / 100);
  const m2 = zaokr(wiersze.filter((w) => w.pozycja.powierzchnia).reduce((a, w) => a + (w.pozycja.ilosc || 0), 0));
  return { wiersze, netto, vat, brutto: zaokr(netto + vat), m2 };
}

/** Podpowiedź czasu realizacji (dni robocze) z powierzchni – wartość edytowalna. */
export function podpowiedzDni(m2: number, stopnie = 0): number {
  if (m2 <= 0 && stopnie <= 0) return 0;
  return 4 + Math.ceil(Math.max(0, m2) / 25) + Math.ceil(Math.max(0, stopnie) / 8);
}

/** Dane zlecenia tworzonego z oferty (przycisk „Zamień na zlecenie”). */
export function zlecenieZOferty(o: Oferta): Partial<Zlecenie> {
  const s = sumaOferty(o);
  const opis = s.wiersze.map((w) => `${w.pozycja.nazwa}: ${String(w.pozycja.ilosc).replace('.', ',')} ${w.pozycja.jedn}`).join('; ');
  const klucze = s.wiersze.map((w) => w.pozycja.klucz);
  const typPrac = klucze.includes('st') && s.m2 === 0 ? 'Schody'
    : klucze.includes('ga') && !klucze.includes('pos') ? 'Garaż'
    : klucze.includes('sm') || klucze.includes('hy') ? 'Łazienka'
    : klucze.includes('pos') ? 'Podłoga' : klucze.includes('sg') ? 'Ściany' : 'Inne';
  return {
    klientId: o.klientId ?? null, klient: o.klient, telefon: o.telefon, adres: o.adres,
    opis: `Oferta ${o.nr}. ${opis}${o.uwagi ? `. Uwagi: ${o.uwagi}` : ''}`,
    system: o.system, typPrac, m2: s.m2 || null, cenaM2: s.m2 ? zaokr(s.brutto / s.m2) : null,
    vat: o.vat, netto: s.netto, brutto: s.brutto, status: 'Zaakceptowane', ofertaId: o.id,
  };
}

/** Kwota zlecenia z ceny brutto za m². */
export function kwotaZCenyM2(m2: number, cenaM2Brutto: number, vat: number) {
  const brutto = zaokr(m2 * cenaM2Brutto);
  return { brutto, netto: nettoZBrutto(brutto, vat) };
}

// ---------- Materiały ----------
export interface PozycjaZuzycia { nazwa: string; ilosc: number; jedn: string; opakowania: number; opakowanie: number }
export function zuzycieMaterialow(m2: number, warstwy: WarstwaZuzycia[]): PozycjaZuzycia[] {
  return (warstwy || []).map((w) => {
    const ilosc = zaokr(Math.max(0, m2) * (w.zuzycie || 0) * (w.warstwy || 0));
    return { nazwa: w.nazwa, ilosc, jedn: w.jedn, opakowanie: w.opakowanie, opakowania: w.opakowanie > 0 ? Math.ceil(ilosc / w.opakowanie - 1e-9) : 0 };
  });
}

/** Rozksięgowanie kosztu ogólnego na zlecenia: po równo albo proporcjonalnie do przychodu netto. */
export function rozksieguj(netto: number, zlecenia: Pick<Zlecenie, 'id' | 'netto'>[], metoda: 'rowno' | 'przychod'): { zlecenieId: string; netto: number }[] {
  if (!zlecenia.length) return [];
  const suma = zlecenia.reduce((a, z) => a + (z.netto || 0), 0);
  const wagi = zlecenia.map((z) => (metoda === 'przychod' && suma > 0 ? (z.netto || 0) / suma : 1 / zlecenia.length));
  const czesci = wagi.map((w) => zaokr(netto * w));
  // grosze z zaokrągleń trafiają do ostatniej pozycji, żeby suma zgadzała się co do grosza
  const roznica = zaokr(netto - czesci.reduce((a, b) => a + b, 0));
  czesci[czesci.length - 1] = zaokr(czesci[czesci.length - 1] + roznica);
  return zlecenia.map((z, i) => ({ zlecenieId: z.id, netto: czesci[i] }));
}
