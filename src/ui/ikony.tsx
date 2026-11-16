const S: Record<string, string> = {
  pulpit: 'M3 12 12 4l9 8M5 10v10h5v-6h4v6h5V10',
  zlecenia: 'M4 6h16M4 12h16M4 18h10',
  oferty: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  godziny: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  wiecej: 'M5 12h.01M12 12h.01M19 12h.01',
  klienci: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.8M16 3.2a3.5 3.5 0 0 1 0 6.6',
  koszty: 'M4 5h16v14H4zM4 10h16M8 15h3',
  dojazdy: 'M3 16V9l2-4h11l3 4h2v7h-2M7 16h8M7 16a2 2 0 1 1-4 0M19 16a2 2 0 1 1-4 0',
  materialy: 'M12 3 3 7.5v9L12 21l9-4.5v-9zM3 7.5 12 12l9-4.5M12 12v9',
  rozliczenie: 'M12 3v18M6 8l-3 6a3 3 0 0 0 6 0zM18 8l-3 6a3 3 0 0 0 6 0zM5 6h14',
  dokumenty: 'M6 3h9l4 4v14H6zM9 13l2 2 4-4',
  kalendarz: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  poczta: 'M3 6h18v12H3zM3 7l9 6 9-6',
  raporty: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  zadania: 'M4 6l2 2 3-3M4 13l2 2 3-3M12 7h8M12 14h8M4 20h.01M12 20h8',
  ustawienia: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
};
export function Ikona({ n, className = 'h-6 w-6' }: { n: string; className?: string }) {
  return <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}><path d={S[n] ?? S.wiecej} /></svg>;
}
