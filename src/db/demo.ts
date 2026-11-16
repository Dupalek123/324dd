// Przykładowe dane demo (zmyślone osoby i adresy) – do wczytania z ekranu logowania lub Ustawień.
import { CENNIK } from '../lib/domyslne';
import { bruttoZNetto, dodajDni, dzis, nettoZBrutto } from '../lib/kwoty';
import { kalkulatorDojazdu } from '../lib/obliczenia';
import type { Kategoria, OsobaId, Vat } from '../lib/typy';
import { akcja, dodaj, zmienUstawienia } from './baza';

export async function wczytajDemo(): Promise<void> {
  const d = (dni: number) => dodajDni(dzis(), dni);
  await akcja('Wczytano dane demo', async () => {
    await zmienUstawienia({ firma: { nazwa: 'Beskid Floor', nip: '547-000-00-00', adres: 'ul. Przykładowa 1, 43-300 Bielsko-Biała', telefon: '600 000 000', email: 'kontakt@beskidfloor.example', www: '', konto: '00 0000 0000 0000 0000 0000 0000', logo: null } });
    const kl = async (nazwa: string, telefon: string, adres: string, zrodlo: string, email = '') => dodaj('klienci', { nazwa, telefon, email, adres, zrodlo, notatki: '' });
    const k1 = await kl('Anna Nowak', '601 111 222', 'ul. Leśna 5, 43-300 Bielsko-Biała', 'Polecenie', 'anna.nowak@example.com');
    const k2 = await kl('Piotr Wiśniewski', '602 333 444', 'ul. Krótka 3, 32-600 Oświęcim', 'Google');
    const k3 = await kl('Marta Zielińska', '605 123 456', 'ul. Sosnowa 12, 34-100 Wadowice', 'Instagram', 'marta.z@example.com');
    const k4 = await kl('Tomasz Kubica', '512 000 111', 'os. Słoneczne 8/4, 34-300 Żywiec', 'Facebook');

    const zl = async (klientId: string, klient: string, telefon: string, adres: string, p: { opis: string; system: string; typPrac: string; m2: number; cenaM2: number; vat: Vat; status: any; start: number; koniec: number | null; od: OsobaId; tryb: 'razem' | 'godz' }) => {
      const brutto = Math.round(p.m2 * p.cenaM2 * 100) / 100;
      return dodaj('zlecenia', { klientId, klient, telefon, adres, opis: p.opis, system: p.system, typPrac: p.typPrac, m2: p.m2, cenaM2: p.cenaM2, vat: p.vat, brutto, netto: nettoZBrutto(brutto, p.vat),
        status: p.status, dataStart: d(p.start), dataKoniec: p.koniec === null ? null : d(p.koniec), klientOd: p.od, tryb: p.tryb, udzial: null, stawka: null, ekipa: ['wlasciciel', 'wspolnik'], notatki: '' });
    };
    const z1 = await zl(k1, 'Anna Nowak', '601 111 222', 'ul. Leśna 5, 43-300 Bielsko-Biała', { opis: 'Salon z kuchnią, podłoga', system: 'TITAN Standard', typPrac: 'Podłoga', m2: 48, cenaM2: 432, vat: 8, status: 'Zakończone', start: -62, koniec: -54, od: 'wlasciciel', tryb: 'razem' });
    const z2 = await zl(k2, 'Piotr Wiśniewski', '602 333 444', 'ul. Krótka 3, 32-600 Oświęcim', { opis: 'Posadzka garażowa antypoślizgowa', system: 'GO!', typPrac: 'Garaż', m2: 28, cenaM2: 356.7, vat: 23, status: 'Zakończone', start: -35, koniec: -31, od: 'wspolnik', tryb: 'godz' });
    const z3 = await zl(k3, 'Marta Zielińska', '605 123 456', 'ul. Sosnowa 12, 34-100 Wadowice', { opis: 'Łazienka: ściany strefy mokrej i podłoga', system: 'HYDROFEST', typPrac: 'Łazienka', m2: 22, cenaM2: 453.6, vat: 8, status: 'W realizacji', start: -3, koniec: 4, od: 'wlasciciel', tryb: 'godz' });
    const z4 = await zl(k4, 'Tomasz Kubica', '512 000 111', 'os. Słoneczne 8/4, 34-300 Żywiec', { opis: 'Schody 15 stopni + korytarz', system: 'LIFE', typPrac: 'Schody', m2: 12, cenaM2: 1296, vat: 8, status: 'Zaakceptowane', start: 12, koniec: 19, od: 'wlasciciel', tryb: 'razem' });

    const ko = (zlecenieId: string | null, dni: number, kategoria: Kategoria, opis: string, netto: number, dostawca = '', vat: Vat = 23) =>
      dodaj('koszty', { data: d(dni), zlecenieId, ogolny: zlecenieId === null, kategoria, opis, dostawca, vat, netto, brutto: bruttoZNetto(netto, vat), plikId: null, dojazd: null, rozdzial: null });
    await ko(z1, -63, 'Materiał', 'Mikrocement, grunt, lakier', 3650, 'Hurtownia');
    await ko(z1, -60, 'Narzędzia', 'Pace i wałki', 280, 'Market budowlany');
    await ko(z2, -36, 'Materiał', 'System garażowy', 1900, 'Hurtownia');
    await ko(z3, -4, 'Materiał', 'Hydroizolacja i mikrocement', 2100, 'Hurtownia');
    await ko(null, -40, 'Inne', 'Ubezpieczenie OC firmy (rok)', 1200, 'Ubezpieczyciel', 0);
    await ko(null, -20, 'Inne', 'Reklama w internecie', 300, '');
    const dojazd = async (zlecenieId: string, dni: number, ileDni: number, km: number) => {
      const p = { dni: ileDni, kmJednaStrona: km, tamIPowrot: true, spalanie: 8, cenaPaliwa: 6.5, zlKm: 0 };
      const w = kalkulatorDojazdu(p);
      await dodaj('koszty', { data: d(dni), zlecenieId, ogolny: false, kategoria: 'Transport', opis: `Dojazdy: ${ileDni} dni × ${km} km`, dostawca: '', vat: 23, brutto: w.razem, netto: nettoZBrutto(w.razem, 23), plikId: null, rozdzial: null, dojazd: { ...p, km: w.km, litry: w.litry } });
    };
    await dojazd(z1, -54, 7, 6);
    await dojazd(z2, -31, 4, 32);
    await dojazd(z3, -1, 3, 38);

    const gd = (zlecenieId: string, dni: number, osoba: OsobaId, godziny: number, opis: string) => dodaj('godziny', { data: d(dni), osoba, zlecenieId, godziny, opis });
    for (const [dz, opis] of [[-62, 'Przygotowanie podłoża'], [-61, 'Warstwa bazowa'], [-59, 'Warstwa wykończeniowa'], [-56, 'Lakierowanie']] as const) {
      await gd(z1, dz, 'wlasciciel', 8, opis); await gd(z1, dz, 'wspolnik', 7.5, opis);
    }
    await gd(z2, -35, 'wspolnik', 9, 'Szlifowanie i grunt'); await gd(z2, -34, 'wspolnik', 8, 'Warstwy'); await gd(z2, -34, 'wlasciciel', 6, 'Pomoc przy warstwach'); await gd(z2, -32, 'wlasciciel', 4.5, 'Lakier');
    await gd(z3, -3, 'wlasciciel', 8, 'Hydroizolacja'); await gd(z3, -2, 'wlasciciel', 8.5, 'Siatka i klej'); await gd(z3, -2, 'wspolnik', 6, 'Siatka i klej'); await gd(z3, -1, 'wspolnik', 5.25, 'Warstwa bazowa');

    await dodaj('wyplaty', { data: d(-50), osoba: 'wspolnik', kwota: 4000, zlecenieId: z1, opis: 'Przelew – część za zlecenie' });

    const pozycje = (il: Record<string, number>) => CENNIK.map((c) => ({ ...c, ilosc: il[c.klucz] ?? null }));
    const rok = new Date().getFullYear();
    await dodaj('oferty', { nr: `BF/${rok}/001`, data: d(-70), klientId: k1, klient: 'Anna Nowak', telefon: '601 111 222', email: 'anna.nowak@example.com', adres: 'ul. Leśna 5, 43-300 Bielsko-Biała', system: 'TITAN Standard', vat: 8, niestandardowe: false, pozycje: pozycje({ pos: 48 }), dni: 7, startDni: 14, zaliczka: 20, waznosc: 14, uwagi: '', status: 'zaakceptowana', wyslano: d(-70), followUp: null, zlecenieId: z1 });
    await dodaj('oferty', { nr: `BF/${rok}/002`, data: d(-6), klientId: k4, klient: 'Tomasz Kubica', telefon: '512 000 111', email: '', adres: 'os. Słoneczne 8/4, 34-300 Żywiec', system: 'LIFE', vat: 8, niestandardowe: false, pozycje: pozycje({ st: 15, pos: 12 }), dni: 7, startDni: 14, zaliczka: 20, waznosc: 14, uwagi: 'Kolor do ustalenia na próbkach.', status: 'wysłana', wyslano: d(-6), followUp: d(1), zlecenieId: z4 });
    await dodaj('oferty', { nr: `BF/${rok}/003`, data: d(-1), klientId: null, klient: 'Ewa Mazur', telefon: '698 555 010', email: 'ewa.mazur@example.com', adres: 'Szczyrk', system: 'TITAN Hardcore', vat: 8, niestandardowe: true, pozycje: pozycje({ pos: 64, sg: 18 }), dni: 9, startDni: 21, zaliczka: 20, waznosc: 14, uwagi: '', status: 'robocza', wyslano: null, followUp: null, zlecenieId: null });

    await dodaj('zapytania', { data: d(0), zrodlo: 'mail', od: 'Karol Bąk <karol.bak@example.com>', temat: 'Mikrocement w kuchni – wycena', status: 'nowe', klientId: null, ofertaId: null, gmailId: null,
      tresc: 'Dzień dobry,\nproszę o wycenę mikrocementu na podłogę w kuchni z jadalnią, około 34 m2, oraz ściany przy prysznicu 9 m2.\nDom w Cieszynie, ul. Ogrodowa 7. Interesuje mnie system LIFE.\nTel. 603 222 111\nPozdrawiam\nKarol Bąk' });

    const m1 = await dodaj('materialy', { nazwa: 'Mikrocement – warstwa bazowa', system: 'TITAN Standard', jedn: 'kg', minStan: 40, cenaNetto: 14, notatki: '' });
    const m2 = await dodaj('materialy', { nazwa: 'Lakier ochronny', system: '', jedn: 'l', minStan: 10, cenaNetto: 95, notatki: '' });
    await dodaj('ruchy', { materialId: m1, data: d(-64), ilosc: 200, zlecenieId: null, opis: 'Zakup' });
    await dodaj('ruchy', { materialId: m1, data: d(-58), ilosc: -110, zlecenieId: z1, opis: 'Zużycie' });
    await dodaj('ruchy', { materialId: m1, data: d(-2), ilosc: -60, zlecenieId: z3, opis: 'Zużycie' });
    await dodaj('ruchy', { materialId: m2, data: d(-64), ilosc: 20, zlecenieId: null, opis: 'Zakup' });
    await dodaj('ruchy', { materialId: m2, data: d(-55), ilosc: -8, zlecenieId: z1, opis: 'Zużycie' });

    await dodaj('zadania', { tytul: 'Zadzwonić w sprawie oferty', opis: '', termin: d(1), osoba: 'wlasciciel', zlecenieId: null, zrobione: false });
    await dodaj('zadania', { tytul: 'Odebrać próbki kolorów', opis: '', termin: d(3), osoba: 'wspolnik', zlecenieId: z4, zrobione: false });
    await dodaj('zadania', { tytul: 'Zamówić lakier', opis: '', termin: d(-1), osoba: 'wlasciciel', zlecenieId: z3, zrobione: false });
  });
}
