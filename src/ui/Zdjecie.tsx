import { useEffect, useState } from 'react';
import { pobierzBlob } from '../db/sync';

/** Miniatura pliku z lokalnej bazy (a gdy go tu nie ma – z chmury). */
export function Zdjecie({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [brak, setBrak] = useState(false);
  useEffect(() => {
    let u: string | null = null, zywy = true;
    pobierzBlob(id).then((b) => { if (!zywy) return; if (b) { u = URL.createObjectURL(b); setUrl(u); } else setBrak(true); });
    return () => { zywy = false; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  if (brak) return <div className={className + ' grid place-items-center bg-wglebienie text-center text-xs text-przygasz'}>Dostępne po połączeniu z siecią</div>;
  if (!url) return <div className={className + ' animate-pulse bg-wglebienie'} />;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={alt} className={className + ' object-cover'} loading="lazy" /></a>;
}
