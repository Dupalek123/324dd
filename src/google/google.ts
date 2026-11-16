// Integracja z Google (Gmail + Kalendarz) po stronie przeglądarki, przez Google Identity Services.
// Najmniejsze potrzebne uprawnienia: odczyt poczty, wysyłka wiadomości, wydarzenia kalendarza.
// Niczego nie wysyłamy bez wyraźnego potwierdzenia użytkownika – potwierdzenia są w widokach.
import { dodajDni } from '../lib/kwoty';

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
export const googleSkonfigurowany = !!GOOGLE_CLIENT_ID;
export const ZAKRESY = {
  pocztaOdczyt: 'https://www.googleapis.com/auth/gmail.readonly',
  pocztaWysylka: 'https://www.googleapis.com/auth/gmail.send',
  kalendarz: 'https://www.googleapis.com/auth/calendar.events',
};

declare global { interface Window { google?: any } }
let skrypt: Promise<void> | null = null;
function zaladuj(): Promise<void> {
  skrypt ??= new Promise((ok, zle) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => ok();
    s.onerror = () => { skrypt = null; zle(new Error('Nie udało się połączyć z Google (brak sieci?).')); };
    document.head.appendChild(s);
  });
  return skrypt;
}

const tokeny = new Map<string, { token: string; wygasa: number }>();
/** Zwraca token dostępu dla zakresu; przy pierwszym użyciu Google pokazuje okno zgody. */
export async function token(zakres: string): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error('Integracja z Google nie jest skonfigurowana (VITE_GOOGLE_CLIENT_ID).');
  const t = tokeny.get(zakres);
  if (t && t.wygasa > Date.now() + 60000) return t.token;
  await zaladuj();
  return new Promise((ok, zle) => {
    const klient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: zakres,
      callback: (r: { access_token?: string; expires_in?: number; error?: string }) => {
        if (!r.access_token) { zle(new Error('Nie uzyskano zgody Google.')); return; }
        tokeny.set(zakres, { token: r.access_token, wygasa: Date.now() + (r.expires_in ?? 3600) * 1000 });
        ok(r.access_token);
      },
      error_callback: () => zle(new Error('Logowanie do Google zostało przerwane.')),
    });
    klient.requestAccessToken({ prompt: t ? '' : 'consent' });
  });
}
export const maToken = (zakres: string) => (tokeny.get(zakres)?.wygasa ?? 0) > Date.now();
export function rozlacz(): void {
  for (const t of tokeny.values()) window.google?.accounts.oauth2.revoke(t.token, () => undefined);
  tokeny.clear();
}

async function api<T>(zakres: string, url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${await token(zakres)}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`Google odpowiedział błędem ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? (undefined as T) : r.json();
}

// ---------- Gmail ----------
export interface Wiadomosc { id: string; od: string; temat: string; data: string; tresc: string }
const zB64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

function trescWiadomosci(p: any): string {
  if (!p) return '';
  if (p.mimeType === 'text/plain' && p.body?.data) return zB64url(p.body.data);
  for (const cz of p.parts ?? []) { const t = trescWiadomosci(cz); if (t) return t; }
  if (p.mimeType === 'text/html' && p.body?.data) return zB64url(p.body.data).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return '';
}

/** Wiadomości pasujące do zapytania Gmaila, np. „label:zapytania” albo „from:(a@x.pl OR b@y.pl)”. */
export async function pobierzWiadomosci(zapytanie: string, ile = 15): Promise<Wiadomosc[]> {
  const baza = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
  const lista = await api<{ messages?: { id: string }[] }>(ZAKRESY.pocztaOdczyt, `${baza}?maxResults=${ile}&q=${encodeURIComponent(zapytanie)}`);
  const wynik: Wiadomosc[] = [];
  for (const m of lista.messages ?? []) {
    const w = await api<any>(ZAKRESY.pocztaOdczyt, `${baza}/${m.id}?format=full`);
    const h = (n: string) => w.payload?.headers?.find((x: any) => x.name.toLowerCase() === n)?.value ?? '';
    wynik.push({ id: m.id, od: h('from'), temat: h('subject'), data: new Date(Number(w.internalDate)).toISOString().slice(0, 10), tresc: trescWiadomosci(w.payload) || w.snippet || '' });
  }
  return wynik;
}

/** Buduje wiadomość MIME (UTF-8, opcjonalny załącznik PDF). Eksportowane do testów. */
export function zbudujMime(p: { do: string; temat: string; tresc: string; zalacznik?: { nazwa: string; base64: string } }): string {
  const temat = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(p.temat)))}?=`;
  const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/(.{76})/g, '$1\r\n');
  if (!p.zalacznik) return [`To: ${p.do}`, `Subject: ${temat}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64(p.tresc)].join('\r\n');
  const g = 'bf_' + Math.random().toString(36).slice(2);
  return [`To: ${p.do}`, `Subject: ${temat}`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${g}"`, '',
    `--${g}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64(p.tresc), '',
    `--${g}`, `Content-Type: application/pdf; name="${p.zalacznik.nazwa}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${p.zalacznik.nazwa}"`, '',
    p.zalacznik.base64.replace(/(.{76})/g, '$1\r\n'), `--${g}--`].join('\r\n');
}

export async function wyslijMail(p: { do: string; temat: string; tresc: string; zalacznik?: { nazwa: string; base64: string } }): Promise<void> {
  const raw = zbudujMime(p);
  // nagłówki i base64 to czyste ASCII, więc wystarczy zwykłe kodowanie
  const zakodowane = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await api(ZAKRESY.pocztaWysylka, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw: zakodowane }) });
}

// ---------- Kalendarz ----------
export interface Wydarzenie { id: string; tytul: string; od: string; do: string; zlecenieId?: string; link?: string }
const kal = (id: string) => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id || 'primary')}/events`;

export async function pobierzWydarzenia(kalendarzId: string, od: string, doo: string): Promise<Wydarzenie[]> {
  const r = await api<{ items?: any[] }>(ZAKRESY.kalendarz, `${kal(kalendarzId)}?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${od}T00:00:00Z&timeMax=${doo}T23:59:59Z`);
  return (r.items ?? []).filter((e) => e.status !== 'cancelled').map((e) => {
    const calyDzien = !!e.start?.date;
    return {
      id: e.id, tytul: e.summary ?? '(bez tytułu)', od: (e.start?.date ?? e.start?.dateTime ?? '').slice(0, 10),
      // w wydarzeniach całodniowych Google podaje dzień PO ostatnim dniu
      do: calyDzien ? dodajDni(e.end.date, -1) : (e.end?.dateTime ?? e.start?.dateTime ?? '').slice(0, 10),
      zlecenieId: e.extendedProperties?.private?.bfZlecenie, link: e.htmlLink,
    };
  });
}

/** Tworzy lub aktualizuje wydarzenie całodniowe zlecenia. Zwraca identyfikator wydarzenia. */
export async function zapiszWydarzenie(kalendarzId: string, z: { id: string; klient: string; adres: string; opis: string; dataStart: string; dataKoniec: string | null; googleEventId?: string | null }, uczestnicy: string): Promise<string> {
  const cialo = {
    summary: `Realizacja: ${z.klient}`, location: z.adres, description: [z.opis, uczestnicy && `Ekipa: ${uczestnicy}`].filter(Boolean).join('\n'),
    start: { date: z.dataStart }, end: { date: dodajDni(z.dataKoniec ?? z.dataStart, 1) },
    extendedProperties: { private: { bfZlecenie: z.id } },
  };
  if (z.googleEventId) {
    try { return (await api<{ id: string }>(ZAKRESY.kalendarz, `${kal(kalendarzId)}/${z.googleEventId}`, { method: 'PATCH', body: JSON.stringify(cialo) })).id; } catch { /* wydarzenie skasowane w Google – tworzymy nowe */ }
  }
  return (await api<{ id: string }>(ZAKRESY.kalendarz, kal(kalendarzId), { method: 'POST', body: JSON.stringify(cialo) })).id;
}
