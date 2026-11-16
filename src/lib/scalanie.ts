// Scalanie rekordów pole po polu (last-writer-wins na poziomie pola, a nie całego rekordu).
// Dzięki temu dwie osoby mogą jednocześnie edytować różne pola tego samego zlecenia bez utraty zmian.
import type { Rek } from './typy';

export interface RekordZdalny {
  tabela: string;
  id: string;
  dane: Record<string, unknown>;
  pola_ts: Record<string, number>;
  wersja?: number;
}

/** Pola lokalne, które nie są wysyłane jako dane. */
export const POLA_META = ['id', '_ts', '_zm', '_brudne'];

let ostatni = 0;
/** Zegar logiczny: rośnie monotonicznie i nigdy nie jest mniejszy od znaczników już widzianych. */
export function teraz(): number {
  ostatni = Math.max(Date.now(), ostatni + 1);
  return ostatni;
}
export function obserwuj(ts: number): void {
  if (Number.isFinite(ts) && ts > ostatni) ostatni = ts;
}

/** Nakłada zmiany na rekord, stemplując każde zmienione pole. Zwraca nowy rekord i listę zmian. */
export function nalozZmiany<T extends Rek>(stary: T | undefined, id: string, zmiany: Partial<T>, ts: number): { rek: T; zmienione: Record<string, [unknown, unknown]> } {
  const rek = { ...(stary ?? {}), id, _ts: { ...(stary?._ts ?? {}) } } as T;
  const zmienione: Record<string, [unknown, unknown]> = {};
  for (const [pole, wartosc] of Object.entries(zmiany)) {
    if (POLA_META.includes(pole) || wartosc === undefined) continue;
    const przed = (stary as Record<string, unknown> | undefined)?.[pole];
    if (stary && JSON.stringify(przed) === JSON.stringify(wartosc)) continue;
    (rek as Record<string, unknown>)[pole] = wartosc;
    rek._ts[pole] = ts;
    zmienione[pole] = [przed ?? null, wartosc];
  }
  rek._zm = ts;
  rek._brudne = 1;
  return { rek, zmienione };
}

/**
 * Scala rekord lokalny ze zdalnym. Dla każdego pola wygrywa nowszy znacznik;
 * przy remisie wygrywa serwer (wszyscy klienci zbiegają do tej samej wartości).
 * `brudne` = true, gdy lokalnie zostały pola nowsze niż w chmurze (trzeba je wysłać).
 */
export function scal<T extends Rek>(lokalny: T | undefined, zdalny: RekordZdalny): { rek: T; brudne: boolean; zmieniony: boolean } {
  const rek = { ...(lokalny ?? {}), id: zdalny.id, _ts: { ...(lokalny?._ts ?? {}) } } as T;
  const r = rek as Record<string, unknown>;
  let zmieniony = !lokalny;
  for (const [pole, tsZ] of Object.entries(zdalny.pola_ts ?? {})) {
    obserwuj(tsZ);
    if (!(pole in (zdalny.dane ?? {}))) continue; // pole ukryte przez serwer (uprawnienia) – nie ruszamy
    const tsL = rek._ts[pole] ?? -1;
    if (tsZ >= tsL) {
      const w = zdalny.dane[pole];
      if (tsZ > tsL || JSON.stringify(r[pole]) !== JSON.stringify(w)) zmieniony = true;
      r[pole] = w;
      rek._ts[pole] = tsZ;
    }
  }
  let brudne = false;
  for (const [pole, tsL] of Object.entries(rek._ts)) {
    if (tsL > (zdalny.pola_ts?.[pole] ?? -1)) { brudne = true; break; }
  }
  rek._zm = lokalny?._zm ?? Math.max(0, ...Object.values(rek._ts));
  rek._brudne = brudne ? 1 : 0;
  return { rek, brudne, zmieniony };
}

/** Scalanie dwóch wersji po stronie serwera (odpowiednik funkcji SQL sync_push) – używane w testach i trybie lokalnym. */
export function scalNaSerwerze(serwer: RekordZdalny | undefined, przychodzacy: RekordZdalny): RekordZdalny {
  const dane = { ...(serwer?.dane ?? {}) };
  const pola_ts = { ...(serwer?.pola_ts ?? {}) };
  for (const [pole, ts] of Object.entries(przychodzacy.pola_ts ?? {})) {
    if (ts > (pola_ts[pole] ?? -1)) {
      dane[pole] = przychodzacy.dane?.[pole] ?? null;
      pola_ts[pole] = ts;
    }
  }
  return { tabela: przychodzacy.tabela, id: przychodzacy.id, dane, pola_ts };
}

export function doZdalnego(tabela: string, rek: Rek): RekordZdalny {
  const dane: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rek)) if (!POLA_META.includes(k)) dane[k] = v;
  return { tabela, id: rek.id, dane, pola_ts: rek._ts ?? {} };
}
