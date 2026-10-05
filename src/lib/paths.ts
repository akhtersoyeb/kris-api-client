/** Maps a path after `from` was renamed or moved to `to` (also remaps anything beneath it). */
export function remapPath(path: string, from: string, to: string): string {
  if (path === from) return to;
  return path.startsWith(`${from}/`) ? to + path.slice(from.length) : path;
}

export const isUnder = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);
