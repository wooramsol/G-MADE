const KOREA_TIME_ZONE = "Asia/Seoul";

const uploadDateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KOREA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const statusCheckedAtFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KOREA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

function toDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUploadDateTime(value: string | undefined): string {
  const date = toDate(value);
  if (!date) return "-";
  return uploadDateTimeFormatter.format(date);
}

export function formatKoreaCheckedAt(value: string | Date): string {
  const date = toDate(value);
  if (!date) return typeof value === "string" ? value : "-";
  return statusCheckedAtFormatter.format(date);
}
