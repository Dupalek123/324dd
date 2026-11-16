// Generowanie PDF w przeglądarce. pdfmake i czcionka Roboto (z polskimi znakami) ładują się dopiero przy pierwszym użyciu.
import { pobierzPlik } from '../db/kopie';
import { komunikat } from '../db/sesja';

let silnik: Promise<any> | null = null;
async function pdfMake() {
  silnik ??= (async () => {
    const [m, f] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
    const pm: any = (m as any).default ?? m;
    const czcionki: any = (f as any).default ?? f;
    if (typeof pm.addVirtualFileSystem === 'function') pm.addVirtualFileSystem(czcionki.pdfMake?.vfs ?? czcionki.vfs ?? czcionki); else pm.vfs = czcionki.pdfMake?.vfs ?? czcionki.vfs ?? czcionki;
    return pm;
  })();
  return silnik;
}

export async function generujPdf(definicja: Record<string, unknown>): Promise<Blob> {
  const pm = await pdfMake();
  const pdf = pm.createPdf(definicja);
  return new Promise<Blob>((ok, zle) => {
    try { const w = pdf.getBlob((b: Blob) => ok(b)); if (w && typeof w.then === 'function') w.then(ok, zle); } catch (e) { zle(e); }
  });
}

export const nazwaPliku = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_') + '.pdf';

export async function pobierzPdf(definicja: Record<string, unknown>, nazwa: string): Promise<Blob> {
  const b = await generujPdf(definicja);
  pobierzPlik(nazwaPliku(nazwa), b);
  return b;
}

/** Systemowe menu udostępniania (telefon). Gdy niedostępne – pobiera plik. */
export async function udostepnijPdf(definicja: Record<string, unknown>, nazwa: string, tekst?: string): Promise<void> {
  const b = await generujPdf(definicja);
  const plik = new File([b], nazwaPliku(nazwa), { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [plik] })) {
    try { await navigator.share({ files: [plik], title: nazwa, text: tekst }); } catch (e) { if ((e as Error).name !== 'AbortError') throw e; }
  } else {
    pobierzPlik(plik.name, b);
    komunikat('Udostępnianie plików nie jest dostępne w tej przeglądarce – PDF został pobrany.', 'info');
  }
}

export async function blobBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
