/**
 * Short display handle from a BITS email / roll number:
 *   f20250970@pilani.bits-pilani.ac.in  ->  F0970
 * (leading letter, uppercased, + the last 4 digits of the roll number).
 */
export function rollHandle(emailOrName: string | null | undefined): string {
  if (!emailOrName) return "?";
  const local = emailOrName.split("@")[0];
  const letter = (local.match(/[a-zA-Z]/)?.[0] ?? "").toUpperCase();
  const digits = local.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  if (last4) return `${letter}${last4}`;
  return (letter || local).toUpperCase();
}
