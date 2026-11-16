// Lokalna baza (IndexedDB przez Dexie). Każda zmiana: stempluje pola, zapisuje historię, trafia na stos cofania
// i oznacza rekord do wysłania. Aplikacja czyta wyłącznie stąd, więc działa bez internetu.
import Dexie, { type Table } from 'dexie';
import { domyslneUstawienia } from '../lib/domyslne';
import { nalozZmiany, teraz } from '../lib/scalanie';
import { TABELE, type OsobaId, type Rek, type Tabela, type TypyTabel, type Ustawienia, type WpisHistorii } from '../lib/typy';

export interface Blob_ { id: string; blob: Blob; wyslany: 0 | 1 }
export interface Meta { klucz: string; wartosc: unknown }

class Baza extends Dexie {
  bloby!: Table<Blob_, string>;
  meta!: Table<Meta, string>;
  constructor(nazwa: string) {
    super(nazwa);
    const schemat: Record<string, string> = { bloby: 'id, wyslany', meta: 'klucz' };
    for (const t of TABELE) schemat[t] = 'id, _brudne';
    this.version(1).stores(schemat);
  }
  tab<T extends Tabela>(t: T): Table<TypyTabel[T], string> {
    return this.table(t);
  }
}

let baza: Baza | null = null;
let kto: OsobaId = 'wlasciciel';
const sluchacze = new Set<() => void>();

export function otworzBaze(nazwa: string, osoba: OsobaId): Baza {
  if (baza && baza.name !== nazwa) baza.close();
  if (!baza || baza.name !== nazwa) baza = new Baza(nazwa);
  kto = osoba;
  return baza;
}
export function db(): Baza {
  if (!baza) throw new Error('Baza nie jest otwarta');
  return baza;
}
export const ktoPisze = (): OsobaId => kto;
/** Wywoływane po każdej lokalnej zmianie (uruchamia synchronizację). */
export function poZmianie(f: () => void): () => void { sluchacze.add(f); return () => sluchacze.delete(f); }
const powiadom = () => sluchacze.forEach((f) => f());

export const nowyId = (): string => crypto.randomUUID();

// ---------- Cofanie ----------
interface KrokCofania { tabela: Tabela; id: string; przed: Record<string, unknown> }
export interface Cofniecie { etykieta: string; kroki: KrokCofania[] }
let grupa: Cofniecie | null = null;
let ostatnie: Cofniecie | null = null;
const sluchaczeCofania = new Set<(c: Cofniecie | null) => void>();
export function naCofniecie(f: (c: Cofniecie | null) => void): () => void { sluchaczeCofania.add(f); return () => sluchaczeCofania.delete(f); }
function zapamietaj(etykieta: string, krok: KrokCofania) {
  if (grupa) { grupa.kroki.push(krok); return; }
  ostatnie = { etykieta, kroki: [krok] };
  sluchaczeCofania.forEach((f) => f(ostatnie));
}
/** Łączy kilka zapisów w jedną akcję (jedno „Cofnij”). */
export async function akcja<T>(etykieta: string, f: () => Promise<T>): Promise<T> {
  if (grupa) return f();
  grupa = { etykieta, kroki: [] };
  try {
    return await f();
  } finally {
    const g = grupa;
    grupa = null;
    if (g.kroki.length) { ostatnie = g; sluchaczeCofania.forEach((s) => s(ostatnie)); }
  }
}
export async function cofnij(): Promise<string | null> {
  const c = ostatnie;
  if (!c) return null;
  ostatnie = null;
  for (const k of [...c.kroki].reverse()) await zapisz(k.tabela, k.id, k.przed as never, { bezCofania: true, akcja: 'przywrócono' });
  sluchaczeCofania.forEach((f) => f(null));
  return c.etykieta;
}

// ---------- Zapis ----------
const etykietaRek = (r: Record<string, unknown>): string =>
  String(r.nazwa ?? r.klient ?? r.tytul ?? r.nr ?? r.opis ?? r.temat ?? '').slice(0, 60);

interface OpcjeZapisu { bezCofania?: boolean; bezHistorii?: boolean; akcja?: WpisHistorii['akcja']; etykieta?: string }

async function zapisz<T extends Tabela>(tabela: T, id: string, zmiany: Partial<TypyTabel[T]>, o: OpcjeZapisu = {}): Promise<void> {
  const d = db();
  const ts = teraz();
  const wynik = await d.transaction('rw', d.table(tabela), d.table('historia'), async () => {
    const stary = (await d.tab(tabela).get(id)) as Rek | undefined;
    const pelne = stary ? { ...zmiany, zmienil: kto } : { utworzono: ts, utworzyl: kto, ...zmiany };
    const { rek, zmienione } = nalozZmiany(stary, id, pelne as Partial<Rek>, ts);
    delete zmienione.zmienil;
    if (stary && Object.keys(zmienione).length === 0) return null;
    await d.table(tabela).put(rek);
    const akcjaH: WpisHistorii['akcja'] = o.akcja ?? (!stary ? 'dodano' : zmienione.usuniety?.[1] === true ? 'usunięto' : zmienione.usuniety ? 'przywrócono' : 'zmieniono');
    if (tabela !== 'historia' && !o.bezHistorii) {
      const h = nalozZmiany<WpisHistorii>(undefined, nowyId(), {
        tabela, rekId: id, akcja: akcjaH, zmiany: stary ? zmienione : {}, kiedy: ts, kto,
        etykieta: etykietaRek(rek as unknown as Record<string, unknown>), utworzono: ts, utworzyl: kto,
      }, ts);
      await d.table('historia').put(h.rek);
    }
    return { stary, zmienione, akcjaH };
  });
  if (!wynik) return;
  if (!o.bezCofania && tabela !== 'historia') {
    const przed: Record<string, unknown> = {};
    if (!wynik.stary) przed.usuniety = true;
    else for (const [pole, [w]] of Object.entries(wynik.zmienione)) przed[pole] = w;
    const opis = o.etykieta ?? (wynik.akcjaH === 'dodano' ? 'Dodano wpis' : wynik.akcjaH === 'usunięto' ? 'Usunięto wpis' : 'Zapisano zmiany');
    zapamietaj(opis, { tabela, id, przed });
  }
  powiadom();
}

export async function dodaj<T extends Tabela>(tabela: T, dane: Partial<TypyTabel[T]>, o?: OpcjeZapisu): Promise<string> {
  const id = (dane.id as string | undefined) ?? nowyId();
  await zapisz(tabela, id, { ...dane, usuniety: false } as Partial<TypyTabel[T]>, o);
  return id;
}
export const zmien = <T extends Tabela>(tabela: T, id: string, zmiany: Partial<TypyTabel[T]>, o?: OpcjeZapisu) => zapisz(tabela, id, zmiany, o);
export const usun = (tabela: Tabela, id: string, o?: OpcjeZapisu) => zapisz(tabela, id, { usuniety: true } as never, o);

// ---------- Ustawienia ----------
export const ID_USTAWIEN = 'glowne';
export function zDomyslnymi(u: Partial<Ustawienia> | undefined): Ustawienia {
  const dom = domyslneUstawienia();
  const w = { id: ID_USTAWIEN, _ts: {}, _zm: 0, utworzono: 0, utworzyl: 'wlasciciel', ...dom, ...(u ?? {}) } as Ustawienia;
  w.firma = { ...dom.firma, ...(u?.firma ?? {}) };
  w.ludzie = { wlasciciel: { ...dom.ludzie.wlasciciel, ...(u?.ludzie?.wlasciciel ?? {}) }, wspolnik: { ...dom.ludzie.wspolnik, ...(u?.ludzie?.wspolnik ?? {}) } };
  w.dojazd = { ...dom.dojazd, ...(u?.dojazd ?? {}) };
  w.uprawnienia = { ...dom.uprawnienia, ...(u?.uprawnienia ?? {}) };
  w.podatki = { ...dom.podatki, ...(u?.podatki ?? {}) };
  w.google = { ...dom.google, ...(u?.google ?? {}) };
  w.szablony = { ...dom.szablony, ...(u?.szablony ?? {}) };
  return w;
}
export const zmienUstawienia = (zmiany: Partial<Ustawienia>) => zapisz('ustawienia', ID_USTAWIEN, zmiany, { etykieta: 'Zapisano ustawienia' });
export async function czytajUstawienia(): Promise<Ustawienia> {
  return zDomyslnymi(await db().tab('ustawienia').get(ID_USTAWIEN));
}

// ---------- Pliki ----------
export async function zapiszBlob(id: string, blob: Blob): Promise<void> {
  await db().bloby.put({ id, blob, wyslany: 0 });
  powiadom();
}

// ---------- Meta ----------
export async function meta<T>(klucz: string, dom: T): Promise<T> {
  return ((await db().meta.get(klucz))?.wartosc as T) ?? dom;
}
export const ustawMeta = (klucz: string, wartosc: unknown) => db().meta.put({ klucz, wartosc });

/** Trwałe usunięcie danych osobowych klienta (RODO) – czyści też powiązane oferty, zlecenia i historię. */
export async function wymazKlienta(klientId: string): Promise<void> {
  const d = db();
  const pusty = { klient: 'Klient usunięty (RODO)', telefon: '', email: '', adres: '' };
  await akcja('Usunięto dane klienta', async () => {
    const powiazane: string[] = [klientId];
    for (const t of ['oferty', 'zlecenia'] as const) {
      for (const r of await d.tab(t).filter((x) => x.klientId === klientId).toArray()) {
        powiazane.push(r.id);
        const z = { ...pusty, klientId: null } as Record<string, unknown>;
        if (t === 'oferty') z.uwagi = ''; else delete z.email;
        await zapisz(t, r.id, z as never, { bezHistorii: true, bezCofania: true });
      }
    }
    for (const r of await d.tab('zapytania').filter((x) => x.klientId === klientId).toArray()) {
      powiazane.push(r.id);
      await zapisz('zapytania', r.id, { od: '', temat: '', tresc: '', usuniety: true } as never, { bezHistorii: true, bezCofania: true });
    }
    for (const r of await d.tab('dokumenty').filter((x) => !!x.zlecenieId && powiazane.includes(x.zlecenieId)).toArray()) {
      await zapisz('dokumenty', r.id, { klient: pusty.klient, adres: '', pola: {}, podpisKlienta: null, usuniety: true } as never, { bezHistorii: true, bezCofania: true });
    }
    await zapisz('klienci', klientId, { nazwa: pusty.klient, telefon: '', email: '', adres: '', notatki: '', zrodlo: '', usuniety: true } as never, { bezHistorii: true, bezCofania: true });
    for (const h of await d.tab('historia').filter((x) => powiazane.includes(x.rekId)).toArray()) {
      await zapisz('historia', h.id, { zmiany: {}, etykieta: '(usunięto – RODO)' } as never, { bezCofania: true });
    }
  });
}
