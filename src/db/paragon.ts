import { normalizujParagon, type DaneParagonu } from '../lib/paragon';
import { sesjaM } from './sesja';
import { supabase } from './sync';

/** Odczyt wymaga konta z synchronizacją (funkcja działa po stronie Supabase). */
export const mozeOdczytacParagon = (): boolean => !!supabase && sesjaM.get()?.tryb === 'chmura';

function base64(b: Blob): Promise<string> {
  return new Promise((ok, zle) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.onerror = () => zle(r.error); r.readAsDataURL(b); });
}

export async function odczytajParagon(blob: Blob): Promise<DaneParagonu> {
  if (!mozeOdczytacParagon()) throw new Error('Odczyt paragonów działa po zalogowaniu kontem (nie w trybie lokalnym).');
  if (!navigator.onLine) throw new Error('Brak internetu – odczyt paragonu wymaga połączenia. Dane możesz wpisać ręcznie.');
  const typ = blob.type || 'image/jpeg';
  const { data, error } = await supabase!.functions.invoke('skanuj-paragon', { body: { obraz: await base64(blob), typ } });
  if (error) {
    const odp = (error as { context?: Response }).context;
    if (odp && typeof odp.json === 'function') {
      if (odp.status === 404) throw new Error('Funkcja „skanuj-paragon” nie jest jeszcze wdrożona w Supabase (instrukcja w README).');
      const t = await odp.json().catch(() => null);
      if (t?.blad) throw new Error(t.blad);
    }
    throw new Error('Nie udało się połączyć z funkcją odczytu paragonów.');
  }
  if (!data?.dane) throw new Error(data?.blad ?? 'Funkcja nie zwróciła danych.');
  return normalizujParagon(data.dane);
}
