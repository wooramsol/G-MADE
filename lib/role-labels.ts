import type { RoleCode } from "./types";

const roleLabels: Record<RoleCode, string> = {
  ADMIN: "관리자",
  REVIEWER: "심사위원",
  OFFICER: "공무원",
  APPLICANT: "지원자",
};

export function getRoleLabel(role: RoleCode): string {
  return roleLabels[role] ?? role;
}
