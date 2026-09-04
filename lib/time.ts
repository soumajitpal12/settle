/** Convert a UTC/ISO timestamp to the browser's local datetime-local value. */
export function toLocalDateTimeInput(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Format stored timestamps for people in their local timezone. */
export function formatLocalDateTime(value: string | Date) {
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
