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

export function formatReviewDay(
  reviewDay: string,
  options: Omit<LocalCalendarDateFormatOptions, "timeZone"> = {}
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reviewDay);
  if (!match) {
    return reviewDay;
  }
  return formatLocalCalendarDate(`${reviewDay}T12:00:00.000Z`, {
    ...options,
    timeZone: "UTC"
  });
}
