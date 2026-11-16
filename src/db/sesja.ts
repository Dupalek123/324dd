// Stan sesji i synchronizacji dostępny dla Reacta (mały magazyn bez zewnętrznych bibliotek).
import { useSyncExternalStore } from 'react';
import type { OsobaId } from '../lib/typy';

export interface Sesja {
  tryb: 'lokalny' | 'chmura';
  osoba: OsobaId;
  email?: string;
  orgId?: string;
}
export interface StanSync {
  status: 'wylaczona' | 'offline' | 'trwa' | 'ok' | 'blad';
  ostatnia: number | null;
  oczekuje: number;
  blad?: string;
  odrzucone: number;
}

function magazyn<T>(poczatek: T) {
  let stan = poczatek;
  const sl = new Set<() => void>();
  return {
    get: () => stan,
    set: (n: T | ((s: T) => T)) => { stan = typeof n === 'function' ? (n as (s: T) => T)(stan) : n; sl.forEach((f) => f()); },
    sub: (f: () => void) => { sl.add(f); return () => sl.delete(f); },
  };
}

const KLUCZ = 'bf-sesja';
function wczytaj(): Sesja | null {
  try { return JSON.parse(localStorage.getItem(KLUCZ) ?? 'null'); } catch { return null; }
}
export const sesjaM = magazyn<Sesja | null>(typeof localStorage === 'undefined' ? null : wczytaj());
export function ustawSesje(s: Sesja | null) {
  if (s) localStorage.setItem(KLUCZ, JSON.stringify(s)); else localStorage.removeItem(KLUCZ);
  sesjaM.set(s);
}
export const useSesja = () => useSyncExternalStore(sesjaM.sub, sesjaM.get);

export const syncM = magazyn<StanSync>({ status: 'wylaczona', ostatnia: null, oczekuje: 0, odrzucone: 0 });
export const useSync = () => useSyncExternalStore(syncM.sub, syncM.get);

export interface Komunikat { id: number; tekst: string; rodzaj: 'ok' | 'blad' | 'info'; cofnij?: boolean }
export const komunikatyM = magazyn<Komunikat[]>([]);
let nr = 0;
export function komunikat(tekst: string, rodzaj: Komunikat['rodzaj'] = 'ok', cofnij = false) {
  const id = ++nr;
  komunikatyM.set((l) => [...l.slice(-2), { id, tekst, rodzaj, cofnij }]);
  setTimeout(() => komunikatyM.set((l) => l.filter((k) => k.id !== id)), cofnij ? 8000 : 4000);
}
export const useKomunikaty = () => useSyncExternalStore(komunikatyM.sub, komunikatyM.get);

const KLUCZ_MOTYWU = 'bf-motyw';
export type Motyw = 'jasny' | 'ciemny' | 'auto';
export const motywM = magazyn<Motyw>((typeof localStorage !== 'undefined' && (localStorage.getItem(KLUCZ_MOTYWU) as Motyw)) || 'auto');
export function ustawMotyw(m: Motyw) { localStorage.setItem(KLUCZ_MOTYWU, m); motywM.set(m); zastosujMotyw(); }
export function zastosujMotyw() {
  const m = motywM.get();
  const ciemny = m === 'ciemny' || (m === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', ciemny);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ciemny ? '#1f1b18' : '#6b5a4a');
}
export const useMotyw = () => useSyncExternalStore(motywM.sub, motywM.get);
