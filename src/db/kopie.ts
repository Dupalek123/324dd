// Kopie zapasowe i eksporty: JSON (całość), CSV i XLSX (tabele), import nowego i starego formatu.
import { fmtData } from '../lib/kwoty';
import { czyStaryFormat, migrujStare, type WynikMigracji } from '../lib/migracja';
import { scal, teraz } from '../lib/scalanie';
import { NAZWY_TABEL, TABELE, type Rek, type Tabela } from '../lib/typy';
import { czytajUstawienia, db, ID_USTAWIEN, nowyId, zmienUstawienia } from './baza';

export const FORMAT = 'beskid-floor-panel';

async function blobDoDataUrl(b: Blob): Promise<string> {
  return new Promise((ok, zle) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.onerror = zle; r.readAsDataURL(b); });
}

export async function zbudujKopie(zPlikami: boolean) {
  const tabele: Record<string, unknown[]> = {};
  for (const t of TABELE) tabele[t] = (await db().table(t).toArray()).map(({ _brudne, ...r }) => r);
  const pliki: Record<string, string> = {};
  if (zPlikami) for (const b of await db().bloby.toArray()) pliki[b.id] = await blobDoDataUrl(b.blob);
  return { format: FORMAT, wersja: 1, data: new Date().toISOString(), tabele, pliki };
}

export function pobierzPlik(nazwa: string, zawartosc: Blob | string, typ = 'application/octet-stream'): void {
  const blob = typeof zawartosc === 'string' ? new Blob([zawartosc], { type: typ }) : zawartosc;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nazwa;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function eksportJSON(zPlikami = true): Promise<void> {
  pobierzPlik(`beskid-floor-kopia-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await zbudujKopie(zPlikami)), 'application/json');
}

export interface WynikImportu { dodano: number; pominieto: number; ostrzezenia: string[]; stary: boolean; liczniki?: WynikMigracji['liczniki'] }

/** Import kopii. Niczego nie kasuje: rekordy są scalane pole po polu z tym, co już jest na urządzeniu. */
export async function importJSON(obiekt: unknown): Promise<WynikImportu> {
  const d = db();
  if (czyStaryFormat(obiekt)) {
    const ts = teraz();
    const m = migrujStare(obiekt as Record<string, unknown>, nowyId, ts);
    let dodano = 0, pominieto = 0;
    await d.transaction('rw', TABELE.map((t) => d.table(t)), async () => {
      for (const [t, wiersze] of Object.entries(m.tabele) as [Tabela, Record<string, unknown>[]][]) {
        // ponowny import tego samego pliku nie tworzy duplikatów (rozpoznajemy po starym identyfikatorze)
        const znane = new Set((await d.table(t).toArray()).filter((r) => !r.usuniety).map((r) => (t === 'klienci' ? `${r.nazwa}|${r.telefon}` : r.stareId)).filter(Boolean));
        for (const w of wiersze) {
          const klucz = t === 'klienci' ? `${w.nazwa}|${w.telefon}` : w.stareId;
          if (klucz && znane.has(klucz)) { pominieto++; continue; }
          const _ts = Object.fromEntries(Object.keys(w).filter((k) => k !== 'id').map((k) => [k, ts]));
          await d.table(t).put({ ...w, usuniety: false, _ts: { ..._ts, usuniety: ts }, _zm: ts, _brudne: 1 });
          dodano++;
        }
      }
    });
    const ust = await czytajUstawienia();
    await zmienUstawienia({ ...m.ustawienia, firma: { ...ust.firma, ...m.ustawienia.firma }, dojazd: { ...ust.dojazd, ...m.ustawienia.dojazd } });
    return { dodano, pominieto, ostrzezenia: m.ostrzezenia, stary: true, liczniki: m.liczniki };
  }
  const k = obiekt as { format?: string; tabele?: Record<string, Rek[]>; pliki?: Record<string, string> };
  if (k?.format !== FORMAT || !k.tabele) throw new Error('To nie jest kopia zapasowa Beskid Floor Panel ani plik ze starego prototypu.');
  let dodano = 0, pominieto = 0;
  await d.transaction('rw', TABELE.map((t) => d.table(t)), async () => {
    for (const t of TABELE) for (const r of k.tabele![t] ?? []) {
      if (!r?.id) continue;
      const lokalny = (await d.table(t).get(r.id)) as Rek | undefined;
      const { _ts, id, _zm, ...dane } = r as Rek & Record<string, unknown>;
      const { rek, zmieniony } = scal(lokalny, { tabela: t, id, dane, pola_ts: _ts ?? {} });
      if (!zmieniony) { pominieto++; continue; }
      await d.table(t).put({ ...rek, _zm: teraz(), _brudne: 1 });
      dodano++;
    }
  });
  for (const [id, url] of Object.entries(k.pliki ?? {})) {
    if (await d.bloby.get(id)) continue;
    await d.bloby.put({ id, blob: await (await fetch(url)).blob(), wyslany: 0 });
  }
  return { dodano, pominieto, ostrzezenia: [], stary: false };
}

// ---------- CSV / XLSX ----------
type Kol = [naglowek: string, wartosc: (r: any, ctx: Kontekst) => unknown];
interface Kontekst { zlecenia: Map<string, string>; osoby: Record<string, string>; materialy: Map<string, string> }
const zl = (r: any, c: Kontekst) => (r.zlecenieId ? c.zlecenia.get(r.zlecenieId) ?? '' : '');
const os = (pole: string) => (r: any, c: Kontekst) => c.osoby[r[pole]] ?? r[pole] ?? '';

export const KOLUMNY: Partial<Record<Tabela, Kol[]>> = {
  zlecenia: [['Klient', (r) => r.klient], ['Telefon', (r) => r.telefon], ['Adres', (r) => r.adres], ['Opis', (r) => r.opis], ['System', (r) => r.system], ['Typ prac', (r) => r.typPrac],
    ['m²', (r) => r.m2], ['Cena brutto/m²', (r) => r.cenaM2], ['Netto', (r) => r.netto], ['VAT %', (r) => r.vat], ['Brutto', (r) => r.brutto], ['Status', (r) => r.status],
    ['Start', (r) => fmtData(r.dataStart)], ['Koniec', (r) => fmtData(r.dataKoniec)], ['Klient od', os('klientOd')], ['Tryb', (r) => (r.tryb === 'godz' ? 'Sam + pomoc godzinowa' : 'Razem')], ['Notatki', (r) => r.notatki]],
  koszty: [['Data', (r) => fmtData(r.data)], ['Zlecenie', (r, c) => zl(r, c) || (r.ogolny ? 'Koszt ogólny' : '')], ['Kategoria', (r) => r.kategoria], ['Opis', (r) => r.opis], ['Dostawca', (r) => r.dostawca],
    ['Netto', (r) => r.netto], ['VAT %', (r) => r.vat], ['Brutto', (r) => r.brutto], ['km', (r) => r.dojazd?.km ?? ''], ['Litry', (r) => r.dojazd?.litry ?? '']],
  godziny: [['Data', (r) => fmtData(r.data)], ['Osoba', os('osoba')], ['Zlecenie', zl], ['Godziny', (r) => r.godziny], ['Opis prac', (r) => r.opis]],
  klienci: [['Nazwa', (r) => r.nazwa], ['Telefon', (r) => r.telefon], ['E-mail', (r) => r.email], ['Adres', (r) => r.adres], ['Źródło', (r) => r.zrodlo], ['Notatki', (r) => r.notatki]],
  oferty: [['Numer', (r) => r.nr], ['Data', (r) => fmtData(r.data)], ['Klient', (r) => r.klient], ['Telefon', (r) => r.telefon], ['E-mail', (r) => r.email], ['Adres', (r) => r.adres], ['System', (r) => r.system], ['VAT %', (r) => r.vat], ['Status', (r) => r.status],
    ['Pozycje', (r) => (r.pozycje ?? []).filter((p: any) => p.ilosc > 0).map((p: any) => `${p.nazwa}: ${p.ilosc} ${p.jedn}`).join('; ')], ['Uwagi', (r) => r.uwagi]],
  wyplaty: [['Data', (r) => fmtData(r.data)], ['Osoba', os('osoba')], ['Kwota', (r) => r.kwota], ['Zlecenie', zl], ['Opis', (r) => r.opis]],
  materialy: [['Nazwa', (r) => r.nazwa], ['System', (r) => r.system], ['Jednostka', (r) => r.jedn], ['Stan minimalny', (r) => r.minStan], ['Cena netto', (r) => r.cenaNetto], ['Notatki', (r) => r.notatki]],
  ruchy: [['Data', (r) => fmtData(r.data)], ['Materiał', (r, c) => c.materialy.get(r.materialId) ?? ''], ['Ilość', (r) => r.ilosc], ['Zlecenie', zl], ['Opis', (r) => r.opis]],
  zadania: [['Tytuł', (r) => r.tytul], ['Termin', (r) => fmtData(r.termin)], ['Osoba', os('osoba')], ['Zlecenie', zl], ['Zrobione', (r) => (r.zrobione ? 'tak' : 'nie')], ['Opis', (r) => r.opis]],
};

export async function wierszeTabeli(t: Tabela): Promise<unknown[][]> {
  const d = db();
  const ust = await czytajUstawienia();
  const ctx: Kontekst = {
    zlecenia: new Map((await d.tab('zlecenia').toArray()).map((z) => [z.id, z.klient])),
    materialy: new Map((await d.tab('materialy').toArray()).map((m) => [m.id, m.nazwa])),
    osoby: { wlasciciel: ust.ludzie.wlasciciel.imie, wspolnik: ust.ludzie.wspolnik.imie },
  };
  const kol = KOLUMNY[t] ?? [];
  const dane = (await d.table(t).toArray()).filter((r) => !r.usuniety && r.id !== ID_USTAWIEN);
  return [kol.map((k) => k[0]), ...dane.map((r) => kol.map((k) => k[1](r, ctx) ?? ''))];
}

export function doCSV(wiersze: unknown[][]): string {
  const pole = (v: unknown) => {
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + wiersze.map((w) => w.map(pole).join(';')).join('\r\n');
}

export async function eksportCSV(t: Tabela): Promise<void> {
  pobierzPlik(`${NAZWY_TABEL[t].toLowerCase()}.csv`, doCSV(await wierszeTabeli(t)), 'text/csv;charset=utf-8');
}

export async function zapiszXLSX(nazwa: string, arkusze: { nazwa: string; wiersze: unknown[][] }[]): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const a of arkusze) {
    const ws = XLSX.utils.aoa_to_sheet(a.wiersze);
    ws['!cols'] = (a.wiersze[0] ?? []).map((_, i) => ({ wch: Math.min(40, Math.max(10, ...a.wiersze.slice(0, 200).map((w) => String(w[i] ?? '').length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, a.nazwa.slice(0, 31));
  }
  const dane = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  pobierzPlik(nazwa, new Blob([dane], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

export async function eksportXLSX(tabele: Tabela[] = Object.keys(KOLUMNY) as Tabela[]): Promise<void> {
  const arkusze = [];
  for (const t of tabele) arkusze.push({ nazwa: NAZWY_TABEL[t], wiersze: await wierszeTabeli(t) });
  await zapiszXLSX(`beskid-floor-${new Date().toISOString().slice(0, 10)}.xlsx`, arkusze);
}

/** RODO: wszystkie dane jednego klienta w jednym pliku. */
export async function eksportKlienta(klientId: string): Promise<void> {
  const d = db();
  const klient = await d.tab('klienci').get(klientId);
  const oferty = await d.tab('oferty').filter((o) => o.klientId === klientId).toArray();
  const zlecenia = await d.tab('zlecenia').filter((z) => z.klientId === klientId).toArray();
  const ids = new Set(zlecenia.map((z) => z.id));
  const dokumenty = await d.tab('dokumenty').filter((x) => !!x.zlecenieId && ids.has(x.zlecenieId)).toArray();
  const zapytania = await d.tab('zapytania').filter((z) => z.klientId === klientId).toArray();
  const czysc = (l: Rek[]) => l.map(({ _ts, _zm, _brudne, ...r }) => r);
  pobierzPlik(`dane-klienta-${(klient?.nazwa ?? 'klient').replace(/\s+/g, '-')}.json`,
    JSON.stringify({ wygenerowano: new Date().toISOString(), klient: klient ? czysc([klient])[0] : null, zapytania: czysc(zapytania), oferty: czysc(oferty), zlecenia: czysc(zlecenia), dokumenty: czysc(dokumenty) }, null, 2), 'application/json');
}
