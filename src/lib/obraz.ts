/** Zmniejsza zdjęcie z aparatu (dłuższy bok do 1600 px, JPEG), żeby nie zapychać pamięci telefonu. */
export async function zmniejszObraz(plik: File, maks = 1600, jakosc = 0.82): Promise<Blob> {
  if (!plik.type.startsWith('image/')) return plik;
  try {
    const bmp = await createImageBitmap(plik);
    const skala = Math.min(1, maks / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * skala);
    c.height = Math.round(bmp.height * skala);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', jakosc));
    return b && b.size < plik.size ? b : plik;
  } catch {
    return plik;
  }
}

/** Odległość drogowa między adresami (OpenStreetMap: Nominatim + OSRM). Wywoływane tylko na żądanie użytkownika. */
export async function odlegloscKm(z: string, dokad: string): Promise<number> {
  const geo = async (adres: string) => {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pl&q=${encodeURIComponent(adres)}`);
    const j = (await r.json()) as { lat: string; lon: string }[];
    if (!j.length) throw new Error(`Nie znaleziono adresu: ${adres}`);
    return `${j[0].lon},${j[0].lat}`;
  };
  const [a, b] = [await geo(z), await geo(dokad)];
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a};${b}?overview=false`);
  const j = (await r.json()) as { routes?: { distance: number }[] };
  if (!j.routes?.length) throw new Error('Nie udało się wyznaczyć trasy.');
  return Math.round(j.routes[0].distance / 100) / 10;
}
