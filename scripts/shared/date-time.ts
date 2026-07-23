const JST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1000;
const JST_OFFSET_SUFFIX = "+09:00";

export function toJstIsoString(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid date-time: ${String(value)}`);
  }
  return new Date(timestamp + JST_OFFSET_MILLISECONDS)
    .toISOString()
    .replace(/Z$/, JST_OFFSET_SUFFIX);
}

export function isJstIsoString(value: string): boolean {
  return value.endsWith(JST_OFFSET_SUFFIX) && Number.isFinite(new Date(value).getTime());
}
