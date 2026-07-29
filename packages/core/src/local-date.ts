export interface LocalCalendarDateFormatOptions {
  locale?: string;
  timeZone?: string;
}

export interface LocalCalendarDateLabelOptions extends LocalCalendarDateFormatOptions {
  now: string | number | Date;
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

export function localCalendarDateKey(
  value: string | number | Date,
  timeZone?: string
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("value must be a valid date");
  }
  return localCalendarDatePartsKey(localCalendarDateParts(date, timeZone));
}

export function formatLocalCalendarDateLabel(
  value: string | number | Date,
  options: LocalCalendarDateLabelOptions
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return String(value);
  }
  const now = options.now instanceof Date ? options.now : new Date(options.now);
  if (!Number.isFinite(now.getTime())) {
    throw new Error("now must be a valid date");
  }
  if (date.getTime() > now.getTime()) {
    return "Scheduled";
  }

  const dateParts = localCalendarDateParts(date, options.timeZone);
  const nowParts = localCalendarDateParts(now, options.timeZone);
  const dateKey = localCalendarDatePartsKey(dateParts);
  const nowKey = localCalendarDatePartsKey(nowParts);
  if (dateKey === nowKey) {
    return "Today";
  }
  if (dateKey === offsetLocalCalendarDateKey(nowParts, -1)) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(options.locale ?? "en-US", {
    month: "short",
    day: "numeric",
    ...(dateParts.year === nowParts.year ? {} : { year: "numeric" as const }),
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

interface LocalCalendarDateParts {
  year: number;
  month: number;
  day: number;
}

function localCalendarDateParts(date: Date, timeZone?: string): LocalCalendarDateParts {
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate()
    };
  }

  const parts = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  return {
    year: localCalendarDatePart(parts, "year"),
    month: localCalendarDatePart(parts, "month"),
    day: localCalendarDatePart(parts, "day")
  };
}

function localCalendarDatePart(
  parts: Intl.DateTimeFormatPart[],
  type: "year" | "month" | "day"
): number {
  const value = Number(parts.find((part) => part.type === type)?.value);
  if (!Number.isInteger(value)) {
    throw new Error(`Unable to determine local calendar ${type}`);
  }
  return value;
}

function localCalendarDatePartsKey(parts: LocalCalendarDateParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function offsetLocalCalendarDateKey(parts: LocalCalendarDateParts, days: number): string {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return localCalendarDatePartsKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  });
}
