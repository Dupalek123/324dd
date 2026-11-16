// Co widzi Wspólnik. Te same reguły egzekwuje baza (funkcja SQL bf_widok_wspolnika w supabase/migrations).
import type { OsobaId, Tabela, Uprawnienia } from './typy';

type R = Record<string, unknown>;

/** Pola zlecenia ukrywane, gdy Wspólnik nie ma uprawnienia „kwoty”. */
export const POLA_KWOT_ZLECENIA = ['netto', 'brutto', 'cenaM2', 'vat', 'udzial'];
/** Pola zlecenia, które Wspólnik może zmieniać. */
export const POLA_ZLECENIA_WSPOLNIKA = ['notatki', 'status', 'listaZakupow'];
const USTAWIENIA_BAZA = ['firma', 'ludzie', 'uprawnienia', 'dojazd', 'zuzycie', 'stawka', 'vatKosztow', 'utworzono', 'utworzyl'];
const USTAWIENIA_OFERTY = ['cennik', 'szablony', 'vatOfert', 'vatZlecen', 'zaliczka', 'waznosc'];

function wybierz(r: R, pola: string[]): R {
  const w: R = {};
  for (const [k, v] of Object.entries(r)) if (pola.includes(k) || k === 'id' || k.startsWith('_')) w[k] = v;
  return w;
}
function bez(r: R, pola: string[]): R {
  const w: R = { ...r };
  for (const p of pola) delete w[p];
  return w;
}

/**
 * Zwraca rekord w postaci widocznej dla danej osoby albo null, gdy nie wolno go pokazać.
 * `widoczneZlecenia` – identyfikatory zleceń, do których Wspólnik ma dostęp.
 */
export function widokRekordu<T>(tabela: Tabela, rek: T, kto: OsobaId, upr: Uprawnienia, widoczneZlecenia?: Set<string>): T | null {
  if (kto === 'wlasciciel') return rek;
  const r = rek as unknown as R;
  const moje = r.utworzyl === 'wspolnik';
  switch (tabela) {
    case 'ustawienia': {
      const pola = [...USTAWIENIA_BAZA, ...(upr.oferty || upr.dokumenty ? USTAWIENIA_OFERTY : []), ...(upr.rozliczenie ? ['udzial'] : [])];
      return wybierz(r, pola) as T;
    }
    case 'zlecenia': {
      const wEkipie = Array.isArray(r.ekipa) && (r.ekipa as string[]).includes('wspolnik');
      if (!upr.wszystkieZlecenia && !wEkipie) return null;
      return (upr.kwoty ? r : bez(r, POLA_KWOT_ZLECENIA)) as T;
    }
    case 'godziny': return upr.wszystkieGodziny || r.osoba === 'wspolnik' ? rek : null;
    case 'koszty': return upr.koszty || moje ? rek : null;
    case 'wyplaty': return upr.rozliczenie || r.osoba === 'wspolnik' ? rek : null;
    case 'klienci':
    case 'zapytania': return upr.klienci ? rek : null;
    case 'oferty': return upr.oferty ? rek : null;
    case 'materialy':
    case 'ruchy': return upr.materialy ? rek : null;
    case 'zadania': return rek;
    case 'dokumenty': return upr.dokumenty ? rek : null;
    case 'pliki':
      if (moje) return rek;
      if (r.rodzaj === 'paragon') return upr.koszty ? rek : null;
      return r.zlecenieId && widoczneZlecenia?.has(r.zlecenieId as string) ? rek : null;
    case 'historia': return r.kto === 'wspolnik' ? rek : null;
    default: return null;
  }
}

export function widoczneZleceniaWspolnika(zlecenia: { id: string; ekipa?: string[] }[], upr: Uprawnienia): Set<string> {
  return new Set(zlecenia.filter((z) => upr.wszystkieZlecenia || (z.ekipa ?? []).includes('wspolnik')).map((z) => z.id));
}

/** Czy osoba może dodawać/zmieniać rekordy w tabeli (zgrubnie – szczegóły pilnuje serwer). */
export function mozePisac(tabela: Tabela, kto: OsobaId, upr: Uprawnienia): boolean {
  if (kto === 'wlasciciel') return true;
  switch (tabela) {
    case 'godziny': case 'zadania': case 'koszty': case 'pliki': case 'historia': case 'zlecenia': return true;
    case 'materialy': case 'ruchy': return upr.materialy;
    case 'klienci': case 'zapytania': return upr.klienci;
    case 'oferty': return upr.oferty;
    case 'dokumenty': return upr.dokumenty;
    default: return false;
  }
}

/** Sekcje menu dostępne dla osoby. */
export function widoczneSekcje(kto: OsobaId, upr: Uprawnienia): Record<string, boolean> {
  const w = kto === 'wlasciciel';
  return {
    pulpit: true, zlecenia: true, godziny: true, zadania: true, kalendarz: true, dojazdy: true,
    koszty: true, rozliczenie: true,
    klienci: w || upr.klienci, oferty: w || upr.oferty, materialy: w || upr.materialy,
    dokumenty: w || upr.dokumenty, raporty: w || upr.raporty, poczta: w || (upr.klienci && upr.oferty),
    ustawienia: true,
  };
}
