// Kwota słownie po polsku (do potwierdzenia zaliczki).
const J = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
const N = ['dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście'];
const D = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt'];
const S = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset'];
const G: [string, string, string][] = [['', '', ''], ['tysiąc', 'tysiące', 'tysięcy'], ['milion', 'miliony', 'milionów']];

/** Odmiana: 1 złoty, 2 złote, 5 złotych. */
export function odmiana(n: number, f: [string, string, string]): string {
  if (n === 1) return f[0];
  const j = n % 10, d = n % 100;
  return j >= 2 && j <= 4 && !(d >= 12 && d <= 14) ? f[1] : f[2];
}
function trojka(n: number): string {
  const s = Math.floor(n / 100), r = n % 100;
  const cz = [S[s]];
  if (r >= 10 && r < 20) cz.push(N[r - 10]); else cz.push(D[Math.floor(r / 10)], J[r % 10]);
  return cz.filter(Boolean).join(' ');
}
export function liczbaSlownie(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  const cz: string[] = [];
  for (let i = 0; n > 0 && i < G.length; i++, n = Math.floor(n / 1000)) {
    const t = n % 1000;
    if (!t) continue;
    cz.unshift([i > 0 && t === 1 ? '' : trojka(t), i > 0 ? odmiana(t, G[i]) : ''].filter(Boolean).join(' '));
  }
  return cz.join(' ');
}
/** 1234.5 → „jeden tysiąc dwieście trzydzieści cztery złote 50/100” */
export function kwotaSlownie(kwota: number): string {
  const gr = Math.round(Math.abs(kwota) * 100);
  const zlote = Math.floor(gr / 100);
  const tekst = zlote >= 1000 && zlote < 2000 ? 'jeden ' + liczbaSlownie(zlote) : liczbaSlownie(zlote);
  return `${tekst} ${odmiana(zlote, ['złoty', 'złote', 'złotych'])} ${String(gr % 100).padStart(2, '0')}/100`;
}
