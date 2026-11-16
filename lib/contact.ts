/** 담당자 연락처·이메일 — 추후 문자·이메일 안내 연동에 쓰이므로 형식을 확인한다 (둘 다 선택 입력) */

export const CONTACT_PHONE_PLACEHOLDER = "예: 010-1234-5678";
export const CONTACT_EMAIL_PLACEHOLDER = "예: name@example.com";
export const CONTACT_NOTICE = "심의 진행 상황을 이 연락처와 이메일로 안내합니다. 정확하게 입력해 주세요.";

/** 숫자만 9~11자리(지역번호·휴대전화), 0으로 시작 — 하이픈·공백은 허용 */
export function isValidContactPhone(value: string): boolean {
  if (!/^[\d\s-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return /^0\d{8,10}$/.test(digits);
}

export function isValidContactEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/** 입력값 검사 — 문제가 있으면 안내 문구, 없으면 빈 문자열 */
export function validateContact(phone: string, email: string): string {
  const trimmedPhone = phone.trim();
  const trimmedEmail = email.trim();
  if (trimmedPhone && !isValidContactPhone(trimmedPhone)) return "담당자 연락처를 전화번호 형식으로 입력해 주세요. (예: 010-1234-5678)";
  if (trimmedEmail && !isValidContactEmail(trimmedEmail)) return "담당자 이메일 형식을 확인해 주세요. (예: name@example.com)";
  return "";
}
