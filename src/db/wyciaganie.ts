import { wyciagnijLokalnie, zOdpowiedziModelu, type DaneZWiadomosci } from '../lib/wyciaganie';
import { sesjaM } from './sesja';
import { supabase } from './sync';

/** Wyciąga dane z wiadomości: model językowy (funkcja Edge), a offline lub przy błędzie – parser lokalny. */
export async function wyciagnijDane(tekst: string): Promise<DaneZWiadomosci> {
  const lokalnie = wyciagnijLokalnie(tekst);
  if (!supabase || sesjaM.get()?.tryb !== 'chmura' || !navigator.onLine) return lokalnie;
  try {
    const { data, error } = await supabase.functions.invoke('wyciagnij-dane', { body: { tekst } });
    if (error || !data?.dane) return lokalnie;
    const m = zOdpowiedziModelu(data.dane);
    // telefon i e-mail z wyrażeń regularnych są pewniejsze niż przepisane przez model
    return { ...m, telefon: lokalnie.telefon || m.telefon, email: lokalnie.email || m.email };
  } catch {
    return lokalnie;
  }
}
