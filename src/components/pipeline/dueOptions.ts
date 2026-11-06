/** Quick date choices, computed in the phone's own time zone. */
function at(daysFromToday: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d;
}
const fmt = (d: Date) => d.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function followupOptions(): { label: string; date: Date; hint: string }[] {
  return [
    { label: "Tomorrow", date: at(1) },
    { label: "In 3 days", date: at(3) },
    { label: "In 1 week", date: at(7) },
  ].map((o) => ({ ...o, hint: fmt(o.date) }));
}

export function snoozeOptions(): { label: string; date: Date; hint: string }[] {
  const inHour = new Date(Date.now() + 3_600_000);
  inHour.setSeconds(0, 0);
  return [
    { label: "1 hour", date: inHour },
    { label: "Tomorrow morning", date: at(1) },
    { label: "In 3 days", date: at(3) },
  ].map((o) => ({ ...o, hint: fmt(o.date) }));
}

/** Value for <input type="datetime-local"> from a Date (local time). */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
