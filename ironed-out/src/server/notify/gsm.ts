/**
 * SMS segments: a text in the GSM-7 alphabet fits 160 characters per segment (153 when split);
 * one character outside it switches the whole message to UCS-2 at 70 (67), roughly tripling the
 * cost. We bill per segment, so outgoing texts are normalized to GSM-7 first.
 */

const BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
/** Allowed, but each costs two characters (escape + char). */
const EXTENDED = '^{}\\[~]|€\f';
const GSM = new Set([...BASIC, ...EXTENDED]);

/** Look-alikes we write in copy (and people type in names) → plain GSM-7. */
const REPLACEMENTS: Record<string, string> = {
  '‘': "'", // ‘
  '’': "'", // ’
  '‚': "'",
  '′': "'",
  '“': '"', // “
  '”': '"', // ”
  '„': '"',
  '″': '"',
  '·': '-', // ·
  '•': '-', // •
  '–': '-', // –
  '—': '-', // —
  '−': '-',
  '…': '...', // …
  '→': '->', // →
  ' ': ' ', // no-break space
  ' ': ' ',
  ' ': ' ',
  '​': '',
  '×': 'x', // ×
};

/**
 * Replaces typographic look-alikes, then strips accents that GSM-7 lacks (á → a). Characters with
 * no stand-in (emoji, CJK) are kept, so a name is never mangled; that message just costs more.
 */
export function toGsm7(text: string): string {
  let out = '';
  for (const ch of text) {
    if (GSM.has(ch)) {
      out += ch;
      continue;
    }
    if (ch in REPLACEMENTS) {
      out += REPLACEMENTS[ch];
      continue;
    }
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '');
    out += base && [...base].every((c) => GSM.has(c)) ? base : ch;
  }
  return out;
}

export const isGsm7 = (text: string) => [...text].every((c) => GSM.has(c));

/** How many billable segments a text costs. */
export function smsSegments(text: string): number {
  if (isGsm7(text)) {
    const units = [...text].reduce((n, c) => n + (EXTENDED.includes(c) ? 2 : 1), 0);
    return units <= 160 ? 1 : Math.ceil(units / 153);
  }
  // UCS-2 counts UTF-16 code units.
  return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
}
