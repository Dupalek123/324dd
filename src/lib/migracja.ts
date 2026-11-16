// Import kopii ze starego prototypu (jeden obiekt JSON: set, zl, gd, ko, of) do nowego modelu.
import { CENNIK, domyslneUstawienia } from './domyslne';
import { bruttoZNetto, nettoZBrutto, zaokr } from './kwoty';
import {
  KATEGORIE, STATUSY_ZLECEN, STAWKI_VAT, type Kategoria, type Klient, type Koszt, type Oferta, type OsobaId,
  type PozycjaOferty, type Tabela, type Ustawienia, type Vat, type WpisGodzin, type Zlecenie,
} from './typy';

type Obj = Record<string, any>;
export interface WynikMigracji {
  tabele: Partial<Record<Tabela, Obj[]>>;
  ustawienia: Partial<Ustawienia>;
  ostrzezenia: string[];
  liczniki: { zlecenia: number; koszty: number; godziny: number; oferty: number; klienci: number };
}

export function czyStaryFormat(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false;
  const x = o as Obj;
  if (x.format === 'beskid-floor-panel') return false;
  return ['zl', 'gd', 'ko', 'of'].some((k) => Array.isArray(x[k])) || !!(x.set && typeof x.set === 'object' && 'ludzie' in x.set);
}

const n = (v: unknown, dom = 0): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : dom;
  if (typeof v === 'string' && v.trim() !== '') { const x = Number(v.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : dom; }
  return dom;
};
const nN = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : n(v));
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const vat = (v: unknown, dom: Vat): Vat => { const x = n(v, dom); return (STAWKI_VAT as number[]).includes(x) ? (x as Vat) : dom; };
const bezOgonkow = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();

export function dataIso(v: unknown): string {
  const t = s(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (typeof v === 'number' && v > 1e11) return new Date(v).toISOString().slice(0, 10);
  return '';
}

/**
 * @param nowyId generator identyfikatorów (wstrzykiwany, żeby testy były deterministyczne)
 * @param ts znacznik czasu importu
 */
export function migrujStare(stare: Obj, nowyId: () => string, ts: number = Date.now()): WynikMigracji {
  const ostrzezenia: string[] = [];
  const set: Obj = stare.set ?? {};
  const ludzie: Obj[] = Array.isArray(set.ludzie) ? set.ludzie : [];
  const dom = domyslneUstawienia();

  const osoba = (v: unknown): OsobaId => {
    if (v === 1 || v === '1') return 'wspolnik';
    if (v === 0 || v === '0' || v === null || v === undefined || v === '') return 'wlasciciel';
    const t = bezOgonkow(s(v));
    if (t === 'wspolnik') return 'wspolnik';
    const i = ludzie.findIndex((l) => bezOgonkow(s(l?.n)) === t);
    if (i === 1) return 'wspolnik';
    if (i === -1 && t !== 'wlasciciel') ostrzezenia.push(`Nie rozpoznano osoby „${s(v)}” – przypisano do właściciela.`);
    return 'wlasciciel';
  };

  const ustawienia: Partial<Ustawienia> = {
    firma: { ...dom.firma, nazwa: s(set.firma) || dom.firma.nazwa, nip: s(set.nip), telefon: s(set.tel), email: s(set.mail), adres: s(set.adres) || dom.firma.adres },
    ludzie: { wlasciciel: { imie: s(ludzie[0]?.n) || dom.ludzie.wlasciciel.imie }, wspolnik: { imie: s(ludzie[1]?.n) || dom.ludzie.wspolnik.imie } },
    udzial: n(set.udz, dom.udzial),
    stawka: n(set.sth, n(ludzie[1]?.st, dom.stawka)),
    dojazd: { ...dom.dojazd, spalanie: n(set.spal, dom.dojazd.spalanie), cenaPaliwa: n(set.pal, dom.dojazd.cenaPaliwa), zlKm: n(set.eksp, dom.dojazd.zlKm) },
  };

  const meta = (stareId: unknown) => ({ id: nowyId(), stareId: s(stareId), utworzono: ts, utworzyl: 'wlasciciel' as OsobaId });
  const klienci = new Map<string, Obj>();
  const klientId = (nazwa: string, tel: string, mail: string, adres: string): string | null => {
    const klucz = bezOgonkow(nazwa) + '|' + tel.replace(/\D/g, '');
    if (!nazwa.trim()) return null;
    let k = klienci.get(klucz);
    if (!k) {
      k = { ...meta(''), nazwa: nazwa.trim(), telefon: tel, email: mail, adres, zrodlo: '', notatki: '' } satisfies Partial<Klient>;
      klienci.set(klucz, k);
    } else {
      if (!k.email && mail) k.email = mail;
      if (!k.adres && adres) k.adres = adres;
      if (!k.telefon && tel) k.telefon = tel;
    }
    return k.id;
  };

  // --- zlecenia ---
  const mapaZl = new Map<string, string>();
  const zlecenia = (Array.isArray(stare.zl) ? stare.zl : []).map((z: Obj) => {
    const v = vat(z.vat, dom.vatZlecen);
    let netto = nN(z.netto) ?? nN(z.kwota);
    let brutto = nN(z.brutto);
    if (netto === null && brutto !== null) netto = nettoZBrutto(brutto, v);
    if (netto === null) netto = 0;
    if (brutto === null) brutto = bruttoZNetto(netto, v);
    let status = STATUSY_ZLECEN.find((x) => bezOgonkow(x) === bezOgonkow(s(z.st)));
    if (!status && typeof z.st === 'number') status = STATUSY_ZLECEN[z.st];
    if (!status) { status = 'Oferta'; if (s(z.st)) ostrzezenia.push(`Zlecenie „${s(z.klient)}”: nieznany status „${s(z.st)}” – ustawiono „Oferta”.`); }
    const rek = {
      ...meta(z.id),
      klientId: klientId(s(z.klient), s(z.tel), '', s(z.adres)),
      klient: s(z.klient), telefon: s(z.tel), adres: s(z.adres), opis: s(z.opis), system: s(z.sys), typPrac: 'Inne',
      m2: nN(z.m2), cenaM2: nN(z.cena), vat: v, netto: zaokr(netto), brutto: zaokr(brutto), status,
      dataStart: dataIso(z.ds ?? z.start) || null, dataKoniec: dataIso(z.dk ?? z.koniec) || null,
      klientOd: osoba(z.od), tryb: s(z.tr) === 'godz' ? 'godz' : 'razem', udzial: null, stawka: nN(z.sth),
      ekipa: ['wlasciciel', 'wspolnik'], notatki: '',
    } satisfies Partial<Zlecenie> & Obj;
    mapaZl.set(s(z.id), rek.id);
    return rek;
  });
  const zlId = (v: unknown, co: string): string | null => {
    if (v === null || v === undefined || v === '') return null;
    const id = mapaZl.get(s(v));
    if (!id) ostrzezenia.push(`${co}: nie znaleziono zlecenia o id „${s(v)}” – wpis zaimportowano bez przypisania.`);
    return id ?? null;
  };

  // --- godziny ---
  const godziny = (Array.isArray(stare.gd) ? stare.gd : []).map((g: Obj) => ({
    ...meta(g.id), data: dataIso(g.d), osoba: osoba(g.os), zlecenieId: zlId(g.zl, 'Godziny'), godziny: n(g.h), opis: s(g.op ?? g.opis),
  } satisfies Partial<WpisGodzin> & Obj));

  // --- koszty ---
  const koszty = (Array.isArray(stare.ko) ? stare.ko : []).map((k: Obj) => {
    const v = vat(k.vat, dom.vatKosztow);
    let netto = nN(k.netto) ?? nN(k.kw);
    let brutto = nN(k.brutto);
    if (netto === null && brutto !== null) netto = nettoZBrutto(brutto, v);
    if (netto === null) netto = 0;
    if (brutto === null) brutto = bruttoZNetto(netto, v);
    const znana = KATEGORIE.find((x) => bezOgonkow(x) === bezOgonkow(s(k.kat)));
    const kategoria = (znana ?? 'Inne') as Kategoria;
    const zlecenieId = zlId(k.zl, 'Koszt');
    const t = k.t && typeof k.t === 'object' ? k.t : null;
    return {
      ...meta(k.id), data: dataIso(k.d), zlecenieId, ogolny: zlecenieId === null, kategoria, opis: s(k.op) + (!znana && s(k.kat) ? ` [${s(k.kat)}]` : ''), dostawca: s(k.dost),
      vat: v, netto: zaokr(netto), brutto: zaokr(brutto), plikId: null, rozdzial: null,
      dojazd: t ? { dni: 0, kmJednaStrona: 0, tamIPowrot: true, spalanie: n(set.spal), cenaPaliwa: n(set.pal), zlKm: n(set.eksp), km: n(t.km), litry: n(t.l) } : null,
    } satisfies Partial<Koszt> & Obj;
  });

  // --- oferty ---
  const oferty = (Array.isArray(stare.of) ? stare.of : []).map((o: Obj) => {
    const it: Obj = o.it && typeof o.it === 'object' ? o.it : {};
    const pozycje: PozycjaOferty[] = CENNIK.map((c) => {
      const p = it[c.klucz];
      const ilosc = p ? nN(p.q) : null;
      return { ...c, ilosc: ilosc && ilosc > 0 ? ilosc : null, cena: p && nN(p.p) !== null ? n(p.p) : c.cena };
    });
    for (const [klucz, p] of Object.entries(it)) {
      if (CENNIK.some((c) => c.klucz === klucz)) continue;
      pozycje.push({ klucz, nazwa: s((p as Obj).n) || `Pozycja „${klucz}”`, jedn: s((p as Obj).j) || 'szt.', cena: n((p as Obj).p), ilosc: nN((p as Obj).q), grupa: 'własne' });
    }
    // W starym formacie cena wpisana w pozycji jest już ceną ostateczną, więc wariantu nie stosujemy drugi raz.
    const niestandardowe = !!o.pan;
    if (niestandardowe) for (const p of pozycje) if (p.altGlobalny && it[p.klucz] && nN(it[p.klucz].p) !== null) p.cenaAlt = p.cena;
    const termLiczba = /^\s*\d+([.,]\d+)?\s*$/.test(s(o.term)) ? n(o.term) : null;
    const uwagi = [s(o.uw), termLiczba === null && s(o.term) ? `Start prac: ${s(o.term)}` : ''].filter(Boolean).join('\n');
    return {
      ...meta(o.id), nr: s(o.nr), data: dataIso(o.data), klientId: klientId(s(o.klient), s(o.tel), s(o.mail), s(o.adres)),
      klient: s(o.klient), telefon: s(o.tel), email: s(o.mail), adres: s(o.adres), system: s(o.sys), vat: vat(o.vat, dom.vatOfert),
      niestandardowe, pozycje, dni: nN(o.dni), startDni: termLiczba, zaliczka: n(o.zal, dom.zaliczka), waznosc: n(o.waz, dom.waznosc),
      uwagi, status: 'robocza', wyslano: null, followUp: null, zlecenieId: null,
    } satisfies Partial<Oferta> & Obj;
  });

  for (const [nazwa, lista] of [['Godziny', godziny], ['Koszty', koszty], ['Oferty', oferty]] as const) {
    const bezDaty = lista.filter((x: Obj) => !x.data).length;
    if (bezDaty) ostrzezenia.push(`${nazwa}: ${bezDaty} wpisów bez rozpoznanej daty.`);
  }

  return {
    tabele: { zlecenia, godziny, koszty, oferty, klienci: [...klienci.values()] },
    ustawienia,
    ostrzezenia: [...new Set(ostrzezenia)],
    liczniki: { zlecenia: zlecenia.length, koszty: koszty.length, godziny: godziny.length, oferty: oferty.length, klienci: klienci.size },
  };
}
