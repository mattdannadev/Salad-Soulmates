export type WorkspaceSearchResult = {
  id: string;
  type: string;
  title: string;
  detail: string;
  href: string;
  score: number;
};

/** Normalizes human input without changing the stored/displayed record value. */
export function normalizeWorkspaceSearch(value: string) {
  return value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Bounded subsequence score tolerates small typos without broad tenant scans. */
export function workspaceSearchScore(query: string, candidate: string) {
  const normalizedQuery = normalizeWorkspaceSearch(query);
  const normalizedCandidate = normalizeWorkspaceSearch(candidate);
  if (normalizedQuery.length < 2 || !normalizedCandidate) return 0;
  if (normalizedCandidate === normalizedQuery) return 100;
  if (normalizedCandidate.startsWith(normalizedQuery)) return 80;
  if (normalizedCandidate.includes(normalizedQuery)) return 60;
  let position = 0;
  for (const letter of normalizedQuery) {
    position = normalizedCandidate.indexOf(letter, position);
    if (position < 0) return 0;
    position += 1;
  }
  return normalizedQuery.length / normalizedCandidate.length >= 0.45 ? 30 : 0;
}
