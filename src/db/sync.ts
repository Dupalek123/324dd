// Synchronizacja z Supabase: wysyłamy rekordy oznaczone jako zmienione, pobieramy nowsze wersje i scalamy pole po polu.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { doZdalnego, scal, type RekordZdalny } from '../lib/scalanie';
import { TABELE, type OsobaId, type Rek, type Tabela } from '../lib/typy';
import { db, meta, poZmianie, ustawMeta } from './baza';
import { komunikat, sesjaM, syncM } from './sesja';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KLUCZ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const chmuraSkonfigurowana = !!(URL_ && KLUCZ);
export const supabase: SupabaseClient | null = chmuraSkonfigurowana ? createClient(URL_!, KLUCZ!) : null;

export interface Org { org_id: string; rola: OsobaId; nazwa: string; email: string }

function blad(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(m)) return 'Nieprawidłowy e-mail lub hasło.';
  if (/already registered/i.test(m)) return 'Konto z tym adresem już istnieje – zaloguj się.';
  if (/Email not confirmed/i.test(m)) return 'Potwierdź adres e-mail (link w wiadomości od Supabase), a potem zaloguj się.';
  if (/Password should be/i.test(m)) return 'Hasło jest za krótkie (minimum 6 znaków).';
  if (/Failed to fetch|NetworkError|fetch failed/i.test(m)) return 'Brak połączenia z serwerem.';
  return m;
}

export async function zaloguj(email: string, haslo: string): Promise<void> {
  const { error } = await supabase!.auth.signInWithPassword({ email, password: haslo });
  if (error) throw new Error(blad(error));
}
export async function zarejestruj(email: string, haslo: string): Promise<boolean> {
  const { data, error } = await supabase!.auth.signUp({ email, password: haslo });
  if (error) throw new Error(blad(error));
  return !!data.session; // false = trzeba potwierdzić e-mail
}
export async function wyloguj(): Promise<void> {
  await supabase?.auth.signOut();
}
export async function resetHasla(email: string): Promise<void> {
  const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) throw new Error(blad(error));
}
/** Firma zalogowanego użytkownika; jeśli czeka na niego zaproszenie – przyjmuje je. */
export async function mojaOrg(): Promise<Org | null> {
  let { data, error } = await supabase!.rpc('moja_org');
  if (error) throw new Error(blad(error));
  if (!data) {
    ({ data, error } = await supabase!.rpc('przyjmij_zaproszenie'));
    if (error) throw new Error(blad(error));
  }
  return (data as Org) ?? null;
}
export async function utworzOrg(nazwa: string): Promise<Org> {
  const { data, error } = await supabase!.rpc('utworz_organizacje', { p_nazwa: nazwa });
  if (error) throw new Error(blad(error));
  return data as Org;
}
export async function rpc<T = unknown>(nazwa: string, parametry?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.rpc(nazwa, parametry);
  if (error) throw new Error(blad(error));
  return data as T;
}

// ---------- pętla synchronizacji ----------
let trwa = false;
let ponow = false;
let kursorSesji: number | null = null; // Wspólnik pobiera całość przy każdym uruchomieniu (zmiany uprawnień)

async function policzOczekujace(): Promise<number> {
  let n = 0;
  for (const t of TABELE) n += await db().table(t).where('_brudne').equals(1).count();
  return n;
}

async function wyslij(): Promise<number> {
  const d = db();
  const paczka: { tabela: Tabela; rek: Rek }[] = [];
  for (const t of TABELE) for (const rek of (await d.table(t).where('_brudne').equals(1).toArray()) as Rek[]) paczka.push({ tabela: t, rek });
  let odrzucone = 0;
  for (let i = 0; i < paczka.length; i += 200) {
    const czesc = paczka.slice(i, i + 200);
    const wynik = await rpc<{ odrzucone: { tabela: string; id: string; powod: string }[] }>('sync_push', {
      p_rekordy: czesc.map((p) => doZdalnego(p.tabela, p.rek)),
    });
    odrzucone += wynik.odrzucone?.length ?? 0;
    if (wynik.odrzucone?.length) console.warn('Odrzucone przez serwer:', wynik.odrzucone);
    await d.transaction('rw', TABELE.map((t) => d.table(t)), async () => {
      for (const p of czesc) {
        const teraz = (await d.table(p.tabela).get(p.rek.id)) as Rek | undefined;
        if (teraz && teraz._zm === p.rek._zm) await d.table(p.tabela).update(p.rek.id, { _brudne: 0 });
      }
    });
  }
  return odrzucone;
}

async function pobierz(): Promise<void> {
  const d = db();
  const s = sesjaM.get()!;
  let od = s.osoba === 'wspolnik' ? (kursorSesji ?? 0) : await meta<number>('wersja', 0);
  let odNowa = false;
  for (;;) {
    const wiersze = await rpc<(RekordZdalny & { wersja: number })[]>('sync_pull', { p_od: od, p_limit: 500 });
    if (!wiersze?.length) break;
    await d.transaction('rw', TABELE.map((t) => d.table(t)), async () => {
      for (const w of wiersze) {
        if (!(TABELE as readonly string[]).includes(w.tabela)) continue;
        const tab = d.table(w.tabela);
        const lokalny = (await tab.get(w.id)) as Rek | undefined;
        if (w.dane?._ukryty) { if (lokalny && lokalny._brudne !== 1) await tab.delete(w.id); continue; }
        const { rek, zmieniony } = scal(lokalny, w);
        if (w.tabela === 'ustawienia' && s.osoba === 'wspolnik' && lokalny
          && JSON.stringify((lokalny as never as { uprawnienia?: unknown }).uprawnienia) !== JSON.stringify((rek as never as { uprawnienia?: unknown }).uprawnienia)) odNowa = true;
        if (zmieniony || !lokalny) await tab.put(rek);
      }
    });
    od = Math.max(od, ...wiersze.map((w) => Number(w.wersja)));
    if (wiersze.length < 500) break;
  }
  if (s.osoba === 'wspolnik') kursorSesji = odNowa ? 0 : od; else await ustawMeta('wersja', od);
  if (odNowa) await pobierz();
}

const sciezka = (orgId: string, rodzaj: string, id: string) => `${orgId}/${rodzaj}/${id}`;

async function wyslijPliki(): Promise<void> {
  const d = db();
  const s = sesjaM.get()!;
  for (const b of await d.bloby.where('wyslany').equals(0).toArray()) {
    const plik = await d.tab('pliki').get(b.id);
    if (!plik) continue;
    const { error } = await supabase!.storage.from('pliki').upload(sciezka(s.orgId!, plik.rodzaj, b.id), b.blob, { upsert: true, contentType: plik.typ || b.blob.type });
    if (error) throw new Error(blad(error));
    await d.bloby.update(b.id, { wyslany: 1 });
  }
}

/** Zwraca plik z urządzenia, a gdy go tu nie ma – pobiera z chmury i zapamiętuje. */
export async function pobierzBlob(id: string): Promise<Blob | null> {
  const d = db();
  const lok = await d.bloby.get(id);
  if (lok) return lok.blob;
  const s = sesjaM.get();
  if (!supabase || s?.tryb !== 'chmura' || !navigator.onLine) return null;
  const plik = await d.tab('pliki').get(id);
  if (!plik) return null;
  const { data } = await supabase.storage.from('pliki').download(sciezka(s.orgId!, plik.rodzaj, id));
  if (!data) return null;
  await d.bloby.put({ id, blob: data, wyslany: 1 });
  return data;
}

/** Automatyczna kopia całości w chmurze – raz na dobę, tylko Właściciel. */
async function kopiaWChmurze(): Promise<void> {
  const s = sesjaM.get()!;
  if (s.osoba !== 'wlasciciel') return;
  const dzis = new Date().toISOString().slice(0, 10);
  if ((await meta<string>('kopia', '')) === dzis) return;
  const { zbudujKopie } = await import('./kopie');
  const tresc = JSON.stringify(await zbudujKopie(false));
  const { error } = await supabase!.storage.from('pliki').upload(`${s.orgId}/kopie/${dzis}.json`, new Blob([tresc], { type: 'application/json' }), { upsert: true });
  if (!error) await ustawMeta('kopia', dzis);
}

export async function listaKopii(): Promise<string[]> {
  const s = sesjaM.get();
  if (!supabase || !s?.orgId) return [];
  const { data } = await supabase.storage.from('pliki').list(`${s.orgId}/kopie`, { sortBy: { column: 'name', order: 'desc' }, limit: 30 });
  return (data ?? []).map((x) => x.name);
}
export async function pobierzKopie(nazwa: string): Promise<Blob | null> {
  const s = sesjaM.get();
  const { data } = await supabase!.storage.from('pliki').download(`${s!.orgId}/kopie/${nazwa}`);
  return data;
}

export async function synchronizuj(): Promise<void> {
  const s = sesjaM.get();
  if (!supabase || !s || s.tryb !== 'chmura') { syncM.set((x) => ({ ...x, status: 'wylaczona' })); return; }
  if (trwa) { ponow = true; return; }
  if (!navigator.onLine) { syncM.set({ ...syncM.get(), status: 'offline', oczekuje: await policzOczekujace() }); return; }
  trwa = true;
  syncM.set((x) => ({ ...x, status: 'trwa' }));
  try {
    const odrzucone = await wyslij();
    await pobierz();
    await wyslijPliki();
    if (odrzucone) komunikat(`Serwer odrzucił ${odrzucone} zmian (brak uprawnień).`, 'blad');
    syncM.set({ status: 'ok', ostatnia: Date.now(), oczekuje: await policzOczekujace(), odrzucone });
    kopiaWChmurze().catch(() => undefined);
  } catch (e) {
    const offline = !navigator.onLine || /Brak połączenia/.test(blad(e));
    syncM.set({ ...syncM.get(), status: offline ? 'offline' : 'blad', blad: blad(e), oczekuje: await policzOczekujace().catch(() => 0) });
  } finally {
    trwa = false;
    if (ponow) { ponow = false; void synchronizuj(); }
  }
}

let uruchomiona = false;
let zegar: ReturnType<typeof setTimeout> | undefined;
/** Uruchamia synchronizację: po każdej zmianie, po powrocie sieci, po powrocie do aplikacji i co 30 s. */
export function uruchomSync(): void {
  kursorSesji = null;
  void synchronizuj();
  if (uruchomiona) return;
  uruchomiona = true;
  poZmianie(() => { clearTimeout(zegar); zegar = setTimeout(() => void synchronizuj(), 1500); });
  window.addEventListener('online', () => void synchronizuj());
  window.addEventListener('offline', () => void synchronizuj());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void synchronizuj(); });
  setInterval(() => { if (document.visibilityState === 'visible') void synchronizuj(); }, 30000);
}
