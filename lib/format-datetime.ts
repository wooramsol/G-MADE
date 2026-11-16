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

const stepDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: KOREA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 단계 완료 시각 등 좁은 자리용 — "2026.10.23 15:47" (한국 시간) */
export function formatCompactDateTime(value: string | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  const parts = Object.fromEntries(stepDateTimeFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

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

/** 평가 기록 탭·라벨용 (차수 대신 평가 시각으로 구분) */
export function formatEvaluationRoundLabel(value: string | undefined): string {
  return formatUploadDateTime(value);
}

export function formatKoreaCheckedAt(value: string | Date): string {
  const date = toDate(value);
  if (!date) return typeof value === "string" ? value : "-";
  return statusCheckedAtFormatter.format(date);
}
