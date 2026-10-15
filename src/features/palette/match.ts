/** Every whitespace-separated word of the query must appear in the text (case-insensitive). */
export function matchesQuery(query: string, text: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = text.toLowerCase();
  return words.every((w) => haystack.includes(w));
}
