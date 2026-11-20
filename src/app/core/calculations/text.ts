/** Strips accents/diacritics and lowercases text so free-text search matches regardless of
 * accent usage (e.g. "José" matches a search for "jose"). Used by every list/search filter
 * across the admin and collector modules. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE')
    .trim();
}
