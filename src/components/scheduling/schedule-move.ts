export interface MovableScheduleItem {
  id: string;
  startAt: string;
  completed?: boolean;
}

export interface ScheduleDependency {
  from: string;
  to: string;
}

/**
 * Returns the unfinished downstream branch for a date move. A completed work
 * order is a fixed boundary: it neither moves nor passes a cascade through to
 * another successor. Predecessors never move when a later work order moves.
 */
export function movableConnectedScheduleIds(
  rootId: string,
  items: MovableScheduleItem[],
  dependencies: ScheduleDependency[],
): string[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  if (!byId.get(rootId) || byId.get(rootId)?.completed) return [];
  const successors = new Map<string, Set<string>>();
  dependencies.forEach(({ from, to }) => {
    const fromSuccessors = successors.get(from) ?? new Set<string>();
    fromSuccessors.add(to);
    successors.set(from, fromSuccessors);
  });
  const moved = new Set<string>([rootId]);
  const pending = [rootId];
  while (pending.length) {
    const current = pending.shift();
    if (current === undefined) break;
    successors.get(current)?.forEach((candidate) => {
      const item = byId.get(candidate);
      if (!item || item.completed || moved.has(candidate)) return;
      moved.add(candidate);
      pending.push(candidate);
    });
  }
  const descendants = [...byId.values()]
    .filter((item) => item.id !== rootId && moved.has(item.id))
    .toSorted((left, right) => (
      left.startAt.localeCompare(right.startAt) || left.id.localeCompare(right.id)
    ));
  return [rootId, ...descendants.map((item) => item.id)];
}
