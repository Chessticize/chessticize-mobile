export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(
    value
    && typeof value === "object"
    && "then" in value
    && typeof (value as { then?: unknown }).then === "function"
  );
}
