/**
 * Normalizes a wine producer/name string for consistent matching.
 * Deterministic: same input always produces same output.
 */
export function normalizeWineText(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // strip accents
    .toLowerCase()
    .replace(/\bch\.\s*/gi, "chateau ")
    .replace(/\bcht\.\s*/gi, "chateau ")
    .replace(/\bdom\.\s*/gi, "domaine ")
    .replace(/\bst\.\s*/gi, "saint ")
    .replace(/\bste\.\s*/gi, "sainte ")
    .replace(/\bmt\.\s*/gi, "mount ")
    .replace(/\s+/g, " ")
    .trim();
}
