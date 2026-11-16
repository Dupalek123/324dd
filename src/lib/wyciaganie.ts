// Lokalne (działające offline) wyciąganie danych z wiadomości klienta. Gdy skonfigurowano funkcję
// Edge „wyciagnij-dane”, używany jest model językowy, a ten parser służy jako zapas.
import { SYSTEMY } from './typy';

export interface DaneZWiadomosci {
  klient: string;
  telefon: string;
  email: string;
  adres: string;
  system: string;
  /** klucz pozycji cennika → ilość */
  ilosci: Record<string, number>;
  uwagi: string;
  zrodlo: 'model' | 'lokalnie';
}

const num = (s: string) => Number(s.replace(',', '.'));
const DUZA = 'A-ZĄĆĘŁŃÓŚŹŻ';
const MALA = 'a-ząćęłńóśźż';

export function wyciagnijLokalnie(tekst: string): DaneZWiadomosci {
  const t = tekst.replace(/\r/g, '');
  const w: DaneZWiadomosci = { klient: '', telefon: '', email: '', adres: '', system: '', ilosci: {}, uwagi: '', zrodlo: 'lokalnie' };

  w.email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(t)?.[0] ?? '';
  const tel = /(?:\+48[\s-]?)?(?<!\d)(\d{3})[\s-]?(\d{3})[\s-]?(\d{3})(?!\d)/.exec(t);
  if (tel) w.telefon = `${tel[1]} ${tel[2]} ${tel[3]}`;

  const imie = `[${DUZA}][${MALA}]+`;
  const wzoryImienia = [
    new RegExp(`(?:Od|From):\\s*"?(${imie}(?:\\s+${imie}){1,2})"?\\s*<`),
    new RegExp(`(?:nazywam się|z tej strony|mówi|tu)\\s+(${imie}(?:\\s+${imie}){0,2})`, 'i'),
    new RegExp(`(?:pozdrawiam|z poważaniem|pozdrowienia|dziękuję)[,!.\\s]*\\n?\\s*(${imie}(?:\\s+${imie}){0,2})`, 'i'),
  ];
  for (const wz of wzoryImienia) {
    const m = wz.exec(t);
    if (m && !/^(Dzień|Witam|Pan|Pani|Proszę)/.test(m[1])) { w.klient = m[1].trim(); break; }
  }

  const adr = new RegExp(`((?:ul\\.|ulica|ulicy|os\\.|osiedle|al\\.|aleja|pl\\.)\\s*[${DUZA}0-9][^\\n,;]*?\\s\\d+[A-Za-z]?(?:/\\d+)?)(?:,?\\s*(\\d{2}-\\d{3})?\\s*((?:[${DUZA}][${MALA}]+[\\s-]?){1,3}))?`).exec(t);
  if (adr) w.adres = [adr[1].trim(), [adr[2], adr[3]?.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (!w.adres) {
    const m = new RegExp(`(?:adres|lokalizacja|inwestycja|miejscowość)\\s*:?\\s*([^\\n]{3,80})`, 'i').exec(t)
      ?? new RegExp(`\\b(?:w|we)\\s+((?:Bielsku-Białej|Oświęcimiu|Wadowicach|Żywcu|Cieszynie|Andrychowie|Kętach|Szczyrku|Czechowicach-Dziedzicach|Skoczowie|Ustroniu|Wiśle|Pszczynie))`).exec(t);
    if (m) w.adres = m[1].trim().replace(/[.;]$/, '');
  }

  for (const s of SYSTEMY) if (new RegExp(s.replace('!', '!?').replace(' ', '\\s+'), 'i').test(t)) { w.system = s; break; }

  // Powierzchnie: przypisujemy po kontekście (słowa przed liczbą mają pierwszeństwo).
  const dodaj = (k: string, v: number) => { if (v > 0) w.ilosci[k] = Math.round(((w.ilosci[k] ?? 0) + v) * 100) / 100; };
  const pow = /(\d+(?:[.,]\d+)?)\s*(?:m2|m²|m\^2|mkw|m\.?\s?kw\.?|metr(?:y|ów)?(?:\s+kw\w*)?)(?![a-z0-9])/gi;
  let m: RegExpExecArray | null;
  while ((m = pow.exec(t))) {
    // najpierw patrzymy na słowa tuż przed liczbą („podłoga w salonie 40 m2”), dopiero potem na te po niej („40 m2 podłogi”)
    const przed = (t.slice(Math.max(0, m.index - 70), m.index).toLowerCase().split(/[.;,\n]|\s(?:i|oraz|plus)\s/).pop() ?? '');
    const po = (t.slice(m.index + m[0].length, m.index + m[0].length + 40).toLowerCase().split(/[.;,\n]|\s(?:i|oraz|plus)\s/)[0] ?? '');
    const rodzaj = (k: string): string | null =>
      /gara[żz]/.test(k) ? 'ga'
        : /[śs]cian/.test(k) ? (/prysznic|mokr|[łl]azien|kabin|wann/.test(k) ? 'sm' : 'sg')
        : /prysznic|kabin/.test(k) ? 'sm'
        : /pod[łl]og|posadzk|salon|kuchni|pok[oó]j|korytarz|sypialni|jadalni|parter|pi[ęe]tr/.test(k) ? 'pos' : null;
    dodaj(rodzaj(przed) ?? rodzaj(po) ?? 'pos', num(m[1]));
  }
  const st = /(\d+)\s*(?:stopni|stopnie|schodk|schod[óo]w)/i.exec(t) ?? /schod\w*[^.\n\d]{0,40}?(\d+)\s*(?:szt|stopni)?/i.exec(t);
  if (st) dodaj('st', Number(st[1]));
  if (w.ilosci.sm) w.ilosci.hy = w.ilosci.sm; // strefa mokra wymaga hydroizolacji – do potwierdzenia w formularzu
  if (/anhydryt/i.test(t) && w.ilosci.pos) w.ilosci.an = w.ilosci.pos;

  const uw: string[] = [];
  if (/[łl]azien/i.test(t)) uw.push('łazienka');
  if (/gara[żz]/i.test(t)) uw.push('garaż');
  if (/schod/i.test(t)) uw.push('schody');
  if (/ogrzewani\w+ pod[łl]ogow/i.test(t)) uw.push('ogrzewanie podłogowe');
  if (/anhydryt/i.test(t)) uw.push('podkład anhydrytowy');
  if (uw.length) w.uwagi = 'W wiadomości: ' + uw.join(', ') + '.';
  return w;
}

/** Porządkuje odpowiedź modelu do tej samej postaci co parser lokalny. */
export function zOdpowiedziModelu(o: Record<string, unknown>): DaneZWiadomosci {
  const ilosci: Record<string, number> = {};
  for (const [k, v] of Object.entries((o.ilosci ?? {}) as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n > 0) ilosci[k] = n;
  }
  const s = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
  return { klient: s(o.klient), telefon: s(o.telefon), email: s(o.email), adres: s(o.adres), system: s(o.system), ilosci, uwagi: s(o.uwagi), zrodlo: 'model' };
}
