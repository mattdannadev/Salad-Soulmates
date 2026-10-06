/** Fixed facility-calendar horizon from the prior workweek through three months ahead. */
export default function plannerWindow(today: string) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const day = Number(today.slice(8, 10));
  const start = new Date(Date.UTC(year, month, day));
  start.setUTCDate(day - ((start.getUTCDay() + 6) % 7) - 7);
  const end = new Date(Date.UTC(year, month + 3, 1));
  const lastDay = new Date(Date.UTC(year, month + 4, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay) + 1);
  return { start: start.toISOString().slice(0, 10), endExclusive: end.toISOString().slice(0, 10) };
}
