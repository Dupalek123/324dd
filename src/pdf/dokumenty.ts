// Definicje dokumentów PDF (pdfmake) w jednym spójnym stylu. Czyste funkcje – sumy testowane w tests/.
import { dodajDni, fmtData, fmtIlosc, zl } from '../lib/kwoty';
import { sumaOferty } from '../lib/obliczenia';
import { kwotaSlownie } from '../lib/slownie';
import { TYPY_DOKUMENTOW, type Dokument, type Oferta, type Ustawienia, type Zlecenie } from '../lib/typy';

type Tresc = Record<string, unknown>;
const BRAZ = '#5f4530';
const SZARY = '#6a6057';
const LINIA = '#d9cdbd';

/** Wstawia wartości w miejsce {{zmiennych}}. Nieznane zmienne zostają jako kreski do wypełnienia ręcznie. */
export function wypelnij(szablon: string, zmienne: Record<string, string | number | null | undefined>): string {
  return (szablon ?? '').replace(/\{\{\s*([\wąćęłńóśźż]+)\s*\}\}/gi, (_, k: string) => {
    const v = zmienne[k];
    return v === null || v === undefined || v === '' ? '..........' : String(v);
  });
}

function naglowek(ust: Ustawienia, tytul: string, nr: string, data: string): Tresc[] {
  const f = ust.firma;
  const dane = [f.adres, f.nip && `NIP ${f.nip}`, f.telefon && `tel. ${f.telefon}`, f.email, f.www].filter(Boolean).join('\n');
  return [
    { columns: [
      f.logo ? { image: f.logo, fit: [150, 60] } : { text: f.nazwa, fontSize: 20, bold: true, color: BRAZ },
      { text: [{ text: f.logo ? f.nazwa + '\n' : '', bold: true }, dane], alignment: 'right', fontSize: 8.5, color: SZARY, lineHeight: 1.25 },
    ] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: BRAZ }], margin: [0, 10, 0, 14] },
    { columns: [
      { text: tytul, fontSize: 17, bold: true },
      { text: [nr ? { text: `Nr ${nr}\n`, bold: true } : '', `Data: ${fmtData(data)}`], alignment: 'right', fontSize: 10 },
    ], margin: [0, 0, 0, 12] },
  ];
}

function podpisy(lewy: string, prawy: string, obrazLewy?: string | null, obrazPrawy?: string | null): Tresc {
  const pole = (etykieta: string, obraz?: string | null) => ({
    stack: [obraz ? { image: obraz, fit: [170, 60], alignment: 'center' } : { text: ' ', margin: [0, 44, 0, 0] },
      { canvas: [{ type: 'line', x1: 20, y1: 0, x2: 210, y2: 0, lineWidth: 0.6, lineColor: SZARY }] },
      { text: etykieta, alignment: 'center', fontSize: 8.5, color: SZARY, margin: [0, 3, 0, 0] }],
  });
  return { columns: [pole(lewy, obrazLewy), pole(prawy, obrazPrawy)], columnGap: 40, margin: [0, 28, 0, 0], unbreakable: true };
}

/** Zamienia tekst szablonu na akapity: nagłówki („§…”, krótkie linie bez kropki), wypunktowania („• …”), zwykłe akapity. */
function akapity(tekst: string): Tresc[] {
  const wynik: Tresc[] = [];
  let lista: string[] = [];
  const zamknij = () => { if (lista.length) { wynik.push({ ul: lista, margin: [0, 0, 0, 6] }); lista = []; } };
  for (const linia of tekst.split('\n')) {
    const l = linia.trim();
    if (!l) { zamknij(); continue; }
    if (/^[•\-–]\s+/.test(l)) { lista.push(l.replace(/^[•\-–]\s+/, '')); continue; }
    zamknij();
    const naglowekSekcji = /^§/.test(l) || (l.length < 40 && !/[.:,;]$/.test(l) && !/\d{2,}/.test(l));
    wynik.push(naglowekSekcji ? { text: l, bold: true, margin: [0, 8, 0, 3] } : { text: l, margin: [0, 0, 0, 5], alignment: 'justify' });
  }
  zamknij();
  return wynik;
}

function szkielet(ust: Ustawienia, tytul: string, tresc: Tresc[]): Tresc {
  return {
    pageSize: 'A4', pageMargins: [40, 40, 40, 50],
    info: { title: tytul, author: ust.firma.nazwa },
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.3, color: '#2b2622' },
    footer: (strona: number, stron: number) => ({ text: `${ust.firma.nazwa}${ust.firma.telefon ? ' · ' + ust.firma.telefon : ''}${ust.firma.email ? ' · ' + ust.firma.email : ''}     ${strona}/${stron}`, alignment: 'center', fontSize: 8, color: SZARY, margin: [0, 18, 0, 0] }),
    content: tresc,
  };
}

const UKLAD_TABELI = {
  hLineWidth: (i: number, n: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === n.table.body.length ? 0.9 : 0.4),
  vLineWidth: () => 0,
  hLineColor: (i: number) => (i <= 1 ? BRAZ : LINIA),
  paddingTop: () => 5, paddingBottom: () => 5,
};

// ---------- Oferta ----------
export function ofertaPdf(o: Oferta, ust: Ustawienia): Tresc {
  const s = sumaOferty(o);
  const waznaDo = dodajDni(o.data, o.waznosc || 0);
  const zm = { system: o.system, adres: o.adres, dni: o.dni, start: o.startDni, zaliczka: fmtIlosc(o.zaliczka), vat: o.vat, waznosc: o.waznosc, waznaDo: fmtData(waznaDo), klient: o.klient };
  const p = (t: string, prawo = false, mocny = false) => ({ text: t, alignment: prawo ? 'right' : 'left', bold: mocny });
  const wiersze = s.wiersze.map((w, i) => [
    p(String(i + 1)), p(w.pozycja.nazwa + (w.cena !== w.pozycja.cena && w.pozycja.altEtykieta ? ` (${w.pozycja.altEtykieta})` : '')),
    p(`${fmtIlosc(w.pozycja.ilosc)} ${w.pozycja.jedn}`, true), p(zl(w.cena), true), p(zl(w.wartosc), true),
  ]);
  return szkielet(ust, `Oferta ${o.nr}`, [
    ...naglowek(ust, 'Oferta', o.nr, o.data),
    { columns: [
      { stack: [{ text: 'Dla', fontSize: 8.5, color: SZARY }, { text: o.klient || '—', bold: true, fontSize: 12 }, { text: [o.adres, o.telefon && `tel. ${o.telefon}`, o.email].filter(Boolean).join('\n'), color: SZARY }] },
      { stack: [{ text: 'System', fontSize: 8.5, color: SZARY }, { text: `Festfloor ${o.system}`, bold: true }, { text: `Ważna do: ${fmtData(waznaDo)}`, color: SZARY }], alignment: 'right' },
    ], margin: [0, 0, 0, 12] },
    { text: wypelnij(ust.szablony.oferta_wstep, zm), margin: [0, 0, 0, 10] },
    { table: { headerRows: 1, widths: [22, '*', 62, 72, 82], body: [
      [p('Lp.', false, true), p('Zakres prac', false, true), p('Ilość', true, true), p('Cena netto', true, true), p('Wartość netto', true, true)],
      ...(wiersze.length ? wiersze : [[p(''), p('Brak pozycji'), p(''), p(''), p('')]]),
    ] }, layout: UKLAD_TABELI },
    { columns: [{ text: '' }, { width: 230, margin: [0, 8, 0, 0], table: { widths: ['*', 90], body: [
      [p('Suma netto'), p(zl(s.netto), true)],
      [p(`VAT ${o.vat}%`), p(zl(s.vat), true)],
      [{ text: 'Do zapłaty brutto', bold: true, fontSize: 12 }, { text: zl(s.brutto), bold: true, fontSize: 12, alignment: 'right' }],
    ] }, layout: 'noBorders' }] },
    { text: 'Warunki', bold: true, fontSize: 12, margin: [0, 14, 0, 4] },
    { ol: wypelnij(ust.szablony.oferta_warunki, zm).split('\n').map((x) => x.trim()).filter(Boolean), fontSize: 9.5 },
    ...(o.uwagi?.trim() ? [{ text: 'Uwagi', bold: true, fontSize: 12, margin: [0, 12, 0, 4] }, { text: o.uwagi }] : []),
    { text: wypelnij(ust.szablony.oferta_stopka, zm), margin: [0, 14, 0, 0], color: SZARY },
    { columns: [{ text: '' }, { width: 220, stack: [{ text: ' ', margin: [0, 30, 0, 0] }, { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.6, lineColor: SZARY }] }, { text: `${ust.ludzie.wlasciciel.imie}, ${ust.firma.nazwa}`, alignment: 'center', fontSize: 8.5, color: SZARY, margin: [0, 3, 0, 0] }], unbreakable: true }] },
  ]);
}

// ---------- Pozostałe dokumenty ----------
export const POLA_DOKUMENTOW: Record<Dokument['typ'], { klucz: string; etykieta: string; dlugie?: boolean }[]> = {
  umowa: [{ klucz: 'adresKlienta', etykieta: 'Adres zamawiającego' }, { klucz: 'zakres', etykieta: 'Zakres prac', dlugie: true }, { klucz: 'dataStart', etykieta: 'Rozpoczęcie prac' }, { klucz: 'dataKoniec', etykieta: 'Planowane zakończenie' }, { klucz: 'netto', etykieta: 'Wynagrodzenie netto' }, { klucz: 'vat', etykieta: 'VAT %' }, { klucz: 'brutto', etykieta: 'Wynagrodzenie brutto' }, { klucz: 'zaliczkaKwota', etykieta: 'Kwota zaliczki' }],
  protokol: [{ klucz: 'zakres', etykieta: 'Zakres wykonanych prac', dlugie: true }, { klucz: 'uwagi', etykieta: 'Uwagi zamawiającego', dlugie: true }, { klucz: 'zastrzezenia', etykieta: 'Odbiór' }],
  pielegnacja: [],
  zaliczka: [{ klucz: 'kwota', etykieta: 'Kwota zaliczki' }, { klucz: 'forma', etykieta: 'Forma płatności' }, { klucz: 'zakres', etykieta: 'Zakres prac', dlugie: true }, { klucz: 'brutto', etykieta: 'Wartość całości brutto' }, { klucz: 'pozostalo', etykieta: 'Pozostaje do zapłaty' }],
  proforma: [{ klucz: 'adresKlienta', etykieta: 'Adres nabywcy' }, { klucz: 'zakres', etykieta: 'Tytuł / zakres', dlugie: true }, { klucz: 'netto', etykieta: 'Wartość netto' }, { klucz: 'vat', etykieta: 'VAT %' }, { klucz: 'kwotaVat', etykieta: 'Kwota VAT' }, { klucz: 'kwota', etykieta: 'Do zapłaty brutto' }, { klucz: 'termin', etykieta: 'Termin płatności' }],
};

/** Wartości pól dokumentu wstawiane automatycznie z danych zlecenia. */
export function domyslnePola(typ: Dokument['typ'], z: Zlecenie | undefined, ust: Ustawienia, data: string): Record<string, string> {
  const zaliczka = z ? Math.round(z.brutto * ust.zaliczka) / 100 : 0;
  const wsp = { zakres: z?.opis ?? '', adresKlienta: z?.adres ?? '' };
  switch (typ) {
    case 'umowa': return { ...wsp, dataStart: fmtData(z?.dataStart), dataKoniec: fmtData(z?.dataKoniec), netto: zl(z?.netto ?? 0), vat: String(z?.vat ?? ust.vatZlecen), brutto: zl(z?.brutto ?? 0), zaliczkaKwota: zl(zaliczka) };
    case 'protokol': return { zakres: wsp.zakres, uwagi: 'brak', zastrzezenia: 'bez zastrzeżeń' };
    case 'zaliczka': return { kwota: zl(zaliczka), forma: 'przelew', zakres: wsp.zakres, brutto: zl(z?.brutto ?? 0), pozostalo: zl((z?.brutto ?? 0) - zaliczka) };
    case 'proforma': return { ...wsp, netto: zl(z?.netto ?? 0), vat: String(z?.vat ?? ust.vatZlecen), kwotaVat: zl((z?.brutto ?? 0) - (z?.netto ?? 0)), kwota: zl(z?.brutto ?? 0), termin: fmtData(dodajDni(data, 7)) };
    default: return {};
  }
}

export function trescDokumentu(d: Dokument, ust: Ustawienia, z?: Zlecenie): string {
  const kwota = Number(String(d.pola.kwota ?? '').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
  return wypelnij(ust.szablony[d.typ] ?? '', {
    data: fmtData(d.data), nr: d.nr, klient: d.klient, adres: d.adres, firma: ust.firma.nazwa, firmaAdres: ust.firma.adres, nip: ust.firma.nip, konto: ust.firma.konto,
    system: z?.system ? `Festfloor ${z.system}` : '', slownie: kwotaSlownie(kwota), ...d.pola,
  });
}

export function dokumentPdf(d: Dokument, ust: Ustawienia, z?: Zlecenie): Tresc {
  const tytul = TYPY_DOKUMENTOW[d.typ];
  const zPodpisami = d.typ !== 'pielegnacja' && d.typ !== 'proforma';
  return szkielet(ust, `${tytul} ${d.nr}`, [
    ...naglowek(ust, tytul, d.nr, d.data),
    ...(d.typ === 'pielegnacja' && d.klient ? [{ text: `Dla: ${d.klient}${d.adres ? ', ' + d.adres : ''}`, color: SZARY, margin: [0, 0, 0, 8] }] : []),
    ...akapity(trescDokumentu(d, ust, z)),
    ...(zPodpisami ? [podpisy(d.typ === 'zaliczka' ? 'Przyjmujący zaliczkę (Wykonawca)' : 'Wykonawca', d.typ === 'zaliczka' ? 'Wpłacający' : 'Zamawiający', d.podpisWykonawcy, d.podpisKlienta)] : []),
  ]);
}

// ---------- Raport ----------
export function raportPdf(ust: Ustawienia, tytul: string, sekcje: { tytul: string; wiersze: unknown[][] }[]): Tresc {
  const tresc: Tresc[] = [...naglowek(ust, tytul, '', new Date().toISOString().slice(0, 10))];
  for (const s of sekcje) {
    if (s.wiersze.length < 2) continue;
    tresc.push({ text: s.tytul, bold: true, fontSize: 12, margin: [0, 10, 0, 4] });
    tresc.push({ table: { headerRows: 1, widths: s.wiersze[0].map((_, i) => (i === 0 ? '*' : 'auto')),
      body: s.wiersze.map((w, r) => w.map((k, i) => ({ text: typeof k === 'number' ? fmtIlosc(k) : String(k ?? ''), bold: r === 0, alignment: i === 0 ? 'left' : 'right', fontSize: 8.5 }))) }, layout: UKLAD_TABELI });
  }
  tresc.push({ text: 'Kwoty netto, wynik przed podatkami i składkami.', color: SZARY, fontSize: 8.5, margin: [0, 10, 0, 0] });
  return { ...szkielet(ust, tytul, tresc), pageOrientation: 'landscape' };
}
