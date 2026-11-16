// Model danych aplikacji. Każdy rekord jest osobnym wpisem w IndexedDB i w chmurze.

export type OsobaId = 'wlasciciel' | 'wspolnik';
export const OSOBY: OsobaId[] = ['wlasciciel', 'wspolnik'];
export const drugaOsoba = (o: OsobaId): OsobaId => (o === 'wlasciciel' ? 'wspolnik' : 'wlasciciel');

export type Vat = 23 | 8 | 5 | 0;
export const STAWKI_VAT: Vat[] = [23, 8, 5, 0];

export const SYSTEMY = ['LIFE', 'TITAN Standard', 'TITAN Hardcore', 'HYDROFEST', 'GO!'] as const;
export const TYPY_PRAC = ['Podłoga', 'Ściany', 'Łazienka', 'Schody', 'Garaż', 'Inne'] as const;
export const STATUSY_ZLECEN = ['Oferta', 'Zaakceptowane', 'W realizacji', 'Zakończone'] as const;
export type StatusZlecenia = (typeof STATUSY_ZLECEN)[number];
export const KATEGORIE = ['Materiał', 'Narzędzia', 'Transport', 'Paliwo', 'Podwykonawca', 'Inne'] as const;
export type Kategoria = (typeof KATEGORIE)[number];
export const STATUSY_OFERT = ['robocza', 'wysłana', 'zaakceptowana', 'odrzucona'] as const;
export type StatusOferty = (typeof STATUSY_OFERT)[number];
export const ZRODLA = ['Polecenie', 'Google', 'Facebook', 'Instagram', 'OLX', 'Strona www', 'Stały klient', 'Inne'] as const;

/** Pola wspólne każdego rekordu (synchronizacja pole po polu). */
export interface Rek {
  id: string;
  /** Znacznik czasu ostatniej zmiany każdego pola (ms, zegar logiczny). */
  _ts: Record<string, number>;
  /** Czas ostatniej lokalnej zmiany rekordu. */
  _zm: number;
  /** 1 = czeka na wysłanie do chmury. */
  _brudne?: 0 | 1;
  usuniety?: boolean;
  utworzono: number;
  utworzyl: OsobaId;
  zmienil?: OsobaId;
}

export interface Klient extends Rek {
  nazwa: string;
  telefon: string;
  email: string;
  adres: string;
  zrodlo: string;
  notatki: string;
}

export interface Zapytanie extends Rek {
  data: string;
  zrodlo: 'mail' | 'sms' | 'ręczne';
  od: string;
  temat: string;
  tresc: string;
  status: 'nowe' | 'obsłużone';
  klientId?: string | null;
  ofertaId?: string | null;
  gmailId?: string | null;
}

export interface PozycjaCennika {
  klucz: string;
  nazwa: string;
  jedn: string;
  cena: number;
  /** Cena wariantu (kolor/rozwiązanie niestandardowe lub wersja rozszerzona). */
  cenaAlt?: number | null;
  altEtykieta?: string;
  /** true = wariant włącza globalny przełącznik „niestandardowe”. */
  altGlobalny?: boolean;
  /** true = ilość liczy się do powierzchni zlecenia (m²). */
  powierzchnia?: boolean;
  grupa: 'główne' | 'dodatkowe' | 'własne';
}

export interface PozycjaOferty extends PozycjaCennika {
  ilosc: number | null;
  wariant?: boolean;
}

export interface Oferta extends Rek {
  nr: string;
  data: string;
  klientId?: string | null;
  klient: string;
  telefon: string;
  email: string;
  adres: string;
  system: string;
  vat: Vat;
  niestandardowe: boolean;
  pozycje: PozycjaOferty[];
  dni: number | null;
  startDni: number | null;
  zaliczka: number;
  waznosc: number;
  uwagi: string;
  status: StatusOferty;
  wyslano?: string | null;
  followUp?: string | null;
  zlecenieId?: string | null;
}

export interface PozycjaZakupu {
  nazwa: string;
  ilosc: number;
  jedn: string;
  kupione: boolean;
}

export interface Zlecenie extends Rek {
  klientId?: string | null;
  klient: string;
  telefon: string;
  adres: string;
  opis: string;
  system: string;
  typPrac: string;
  m2: number | null;
  /** Cena brutto za m² – wpisanie wylicza kwotę. */
  cenaM2: number | null;
  vat: Vat;
  netto: number;
  brutto: number;
  status: StatusZlecenia;
  dataStart: string | null;
  dataKoniec: string | null;
  klientOd: OsobaId;
  tryb: 'razem' | 'godz';
  /** Procent dla osoby z pola „Klient od” (tryb RAZEM); null = z ustawień. */
  udzial: number | null;
  /** Stawka godzinowa pomocnika (tryb SAM + POMOC); null = z ustawień. */
  stawka: number | null;
  ekipa: OsobaId[];
  notatki: string;
  ofertaId?: string | null;
  listaZakupow?: PozycjaZakupu[];
  googleEventId?: string | null;
}

export interface DojazdDane {
  dni: number;
  kmJednaStrona: number;
  tamIPowrot: boolean;
  spalanie: number;
  cenaPaliwa: number;
  zlKm: number;
  km: number;
  litry: number;
}

export interface Koszt extends Rek {
  data: string;
  zlecenieId: string | null;
  /** Koszt ogólny firmy (nieprzypisany do jednego zlecenia). */
  ogolny: boolean;
  kategoria: Kategoria;
  opis: string;
  dostawca: string;
  vat: Vat;
  netto: number;
  brutto: number;
  plikId?: string | null;
  dojazd?: DojazdDane | null;
  /** Rozksięgowanie kosztu ogólnego na zlecenia (kwoty netto). */
  rozdzial?: { zlecenieId: string; netto: number }[] | null;
}

export interface WpisGodzin extends Rek {
  data: string;
  osoba: OsobaId;
  zlecenieId: string | null;
  godziny: number;
  opis: string;
}

export interface Wyplata extends Rek {
  data: string;
  osoba: OsobaId;
  kwota: number;
  zlecenieId: string | null;
  opis: string;
}

export interface Material extends Rek {
  nazwa: string;
  system: string;
  jedn: string;
  minStan: number;
  cenaNetto: number;
  notatki: string;
}

export interface RuchMaterialu extends Rek {
  materialId: string;
  data: string;
  /** Dodatnia = przyjęcie, ujemna = zużycie. */
  ilosc: number;
  zlecenieId: string | null;
  opis: string;
}

export interface Zadanie extends Rek {
  tytul: string;
  opis: string;
  termin: string | null;
  osoba: OsobaId | null;
  zlecenieId: string | null;
  ofertaId?: string | null;
  zrobione: boolean;
}

export const TYPY_DOKUMENTOW = {
  umowa: 'Umowa o dzieło',
  protokol: 'Protokół odbioru prac',
  pielegnacja: 'Instrukcja pielęgnacji',
  zaliczka: 'Potwierdzenie zaliczki',
  proforma: 'Proforma',
} as const;
export type TypDokumentu = keyof typeof TYPY_DOKUMENTOW;

export interface Dokument extends Rek {
  typ: TypDokumentu;
  nr: string;
  data: string;
  zlecenieId: string | null;
  klient: string;
  adres: string;
  /** Wartości pól szablonu (zakres, uwagi, kwota itd.). */
  pola: Record<string, string>;
  podpisKlienta?: string | null;
  podpisWykonawcy?: string | null;
}

export interface Plik extends Rek {
  rodzaj: 'zdjecie' | 'paragon' | 'dokument';
  zlecenieId: string | null;
  kosztId: string | null;
  nazwa: string;
  typ: string;
  rozmiar: number;
}

export interface WpisHistorii extends Rek {
  tabela: string;
  rekId: string;
  akcja: 'dodano' | 'zmieniono' | 'usunięto' | 'przywrócono';
  /** pole -> [przed, po] */
  zmiany: Record<string, [unknown, unknown]>;
  kiedy: number;
  kto: OsobaId;
  etykieta: string;
}

export interface Uprawnienia {
  /** Kwoty zleceń, marże, wynik. */
  kwoty: boolean;
  /** Koszty zakupu (wszystkie). */
  koszty: boolean;
  /** Pełne rozliczenie wspólników. */
  rozliczenie: boolean;
  wszystkieZlecenia: boolean;
  wszystkieGodziny: boolean;
  klienci: boolean;
  oferty: boolean;
  raporty: boolean;
  materialy: boolean;
  dokumenty: boolean;
}

export interface WarstwaZuzycia {
  nazwa: string;
  /** Zużycie na 1 m² i 1 warstwę. */
  zuzycie: number;
  warstwy: number;
  jedn: string;
  /** Wielkość opakowania handlowego. */
  opakowanie: number;
}

export interface Ustawienia extends Rek {
  firma: { nazwa: string; nip: string; adres: string; telefon: string; email: string; www: string; konto: string; logo: string | null };
  ludzie: Record<OsobaId, { imie: string }>;
  udzial: number;
  stawka: number;
  vatZlecen: Vat;
  vatKosztow: Vat;
  vatOfert: Vat;
  zaliczka: number;
  waznosc: number;
  cennik: PozycjaCennika[];
  szablony: Record<string, string>;
  dojazd: { spalanie: number; cenaPaliwa: number; zlKm: number; vat: Vat };
  zuzycie: Record<string, WarstwaZuzycia[]>;
  uprawnienia: Uprawnienia;
  podatki: { wlaczone: boolean; podatekProc: number; zdrowotnaProc: number; zusMies: number };
  google: { zapytanie: string; kalendarzId: string };
}

export const TABELE = [
  'ustawienia', 'klienci', 'zapytania', 'oferty', 'zlecenia', 'koszty', 'godziny', 'wyplaty',
  'materialy', 'ruchy', 'zadania', 'dokumenty', 'pliki', 'historia',
] as const;
export type Tabela = (typeof TABELE)[number];

export interface TypyTabel {
  ustawienia: Ustawienia;
  klienci: Klient;
  zapytania: Zapytanie;
  oferty: Oferta;
  zlecenia: Zlecenie;
  koszty: Koszt;
  godziny: WpisGodzin;
  wyplaty: Wyplata;
  materialy: Material;
  ruchy: RuchMaterialu;
  zadania: Zadanie;
  dokumenty: Dokument;
  pliki: Plik;
  historia: WpisHistorii;
}

export const NAZWY_TABEL: Record<Tabela, string> = {
  ustawienia: 'Ustawienia', klienci: 'Klienci', zapytania: 'Zapytania', oferty: 'Oferty', zlecenia: 'Zlecenia',
  koszty: 'Koszty', godziny: 'Godziny', wyplaty: 'Wypłaty', materialy: 'Materiały', ruchy: 'Ruchy magazynowe',
  zadania: 'Zadania', dokumenty: 'Dokumenty', pliki: 'Pliki', historia: 'Historia zmian',
};
