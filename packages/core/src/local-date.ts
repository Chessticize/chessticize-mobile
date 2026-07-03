export interface LocalCalendarDateFormatOptions {
  locale?: string;
  timeZone?: string;
}

export function formatLocalCalendarDate(
  value: string | number | Date,
  options: LocalCalendarDateFormatOptions = {}
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(options.locale ?? "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(options.timeZone ? { timeZone: options.timeZone } : {})
  }).format(date);
}
