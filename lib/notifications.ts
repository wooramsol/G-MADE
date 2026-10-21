import { getPrismaClient, isDatabaseAvailable } from "./prisma";

/**
 * 앱 내 알림 — 받는 사람마다 1건씩 저장하고, 상단 종 아이콘에 안 읽은 개수를 표시.
 * 공무원: 신규 도서 접수 / 보완 도서 제출
 * 지원자: 사전심의 시작 / 보완 요청 / 본심의 진행 (+ 반려)
 * 알림 저장 실패가 본 작업(접수·판정)을 막지 않도록 모든 함수는 오류를 삼킨다.
 */

export type NotificationKind = "NEW_SUBMISSION" | "RESUBMISSION" | "PRE_REVIEW" | "REVISION_REQUESTED" | "MAIN_REVIEW" | "CLOSED" | "REJECTED" | "WITHDRAWN";

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
};

type Payload = { kind: NotificationKind; title: string; body?: string; link?: string; projectId?: string };

const ENV_ADMIN_ID = "env-admin";

export async function notifyUsers(userIds: string[], payload: Payload): Promise<void> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return;
  try {
    if (!(await isDatabaseAvailable())) return;
    const prisma = getPrismaClient();
    if (!prisma) return;
    await prisma.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        kind: payload.kind,
        title: payload.title.slice(0, 200),
        body: payload.body?.slice(0, 1_000),
        link: payload.link,
        projectId: payload.projectId,
      })),
    });
  } catch (error) {
    console.warn("[notifications] 저장 실패", error instanceof Error ? error.message : error);
  }
}

/** 공무원 전원(관리자 포함)에게 */
export async function notifyOfficials(payload: Payload, excludeUserId?: string): Promise<void> {
  try {
    if (!(await isDatabaseAvailable())) return;
    const prisma = getPrismaClient();
    if (!prisma) return;
    const officials = await prisma.user.findMany({
      where: { active: true, role: { code: { in: ["ADMIN", "OFFICER", "REVIEWER"] } } },
      select: { id: true },
    });
    const ids = [...officials.map((user: { id: string }) => user.id), ...(process.env.ADMIN_EMAIL ? [ENV_ADMIN_ID] : [])];
    await notifyUsers(ids.filter((id) => id !== excludeUserId), payload);
  } catch (error) {
    console.warn("[notifications] 공무원 알림 실패", error instanceof Error ? error.message : error);
  }
}

export async function listNotifications(userId: string, limit = 30): Promise<{ unread: number; items: NotificationItem[] }> {
  try {
    if (!(await isDatabaseAvailable())) return { unread: 0, items: [] };
    const prisma = getPrismaClient();
    if (!prisma) return { unread: 0, items: [] };
    const [unread, rows] = await Promise.all([
      prisma.notification.count({ where: { userId, readAt: null } }),
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit }),
    ]);
    type Row = { id: string; kind: string; title: string; body: string | null; link: string | null; createdAt: Date; readAt: Date | null };
    return {
      unread,
      items: (rows as Row[]).map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        link: row.link,
        createdAt: row.createdAt.toISOString(),
        read: Boolean(row.readAt),
      })),
    };
  } catch (error) {
    console.warn("[notifications] 조회 실패", error instanceof Error ? error.message : error);
    return { unread: 0, items: [] };
  }
}

export async function markNotificationsRead(userId: string, ids: string[] | "all"): Promise<void> {
  try {
    const prisma = getPrismaClient();
    if (!prisma) return;
    await prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
      data: { readAt: new Date() },
    });
  } catch (error) {
    console.warn("[notifications] 읽음 처리 실패", error instanceof Error ? error.message : error);
  }
}
