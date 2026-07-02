import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
const prisma = connectionString
  ? new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) })
  : new PrismaClient();

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { code: "ADMIN" },
    update: {},
    create: {
      code: "ADMIN",
      name: "관리자",
      description: "평가항목, 평가기준, AI 가중치, 심사위원, 프로젝트, 통계 관리",
    },
  });

  await prisma.role.upsert({
    where: { code: "REVIEWER" },
    update: {},
    create: {
      code: "REVIEWER",
      name: "심사위원",
      description: "프로젝트 열람, 평가 수행, 의견 작성, AI 결과 확인",
    },
  });

  await prisma.role.upsert({
    where: { code: "OFFICER" },
    update: {},
    create: {
      code: "OFFICER",
      name: "공무원",
      description: "사업 등록, 자료 업로드, 결과 확인, 보고서 출력",
    },
  });

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD?.trim();

  if (adminEmail && adminPassword) {
    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (existingAdmin) {
      // 이미 존재하는 계정의 비밀번호는 seed가 덮어쓰지 않는다.
      await prisma.user.update({
        where: { email: adminEmail },
        data: { roleId: adminRole.id, active: true },
      });
      console.log(`관리자 계정이 이미 존재하여 비밀번호는 변경하지 않았습니다: ${adminEmail}`);
    } else {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await prisma.user.create({
        data: {
          email: adminEmail,
          name: "시스템 관리자",
          passwordHash,
          roleId: adminRole.id,
        },
      });
      console.log(`관리자 계정을 생성했습니다: ${adminEmail}`);
    }
  } else {
    console.warn(
      "ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD 환경 변수가 없어 관리자 계정 seed를 건너뜁니다.",
    );
  }

  await prisma.setting.upsert({
    where: { key: "hybrid_evaluation_weights" },
    update: { value: { aiWeight: 30, humanWeight: 70 } },
    create: {
      key: "hybrid_evaluation_weights",
      value: { aiWeight: 30, humanWeight: 70 },
      description: "관리자가 자유롭게 조정하는 AI/인간 평가 가중치",
    },
  });

  const urbanContext = await prisma.evaluationCategory.create({
    data: {
      name: "도시맥락",
      description: "주변환경, 스카이라인, 조망축과의 조화",
      sortOrder: 1,
      children: {
        create: [{ name: "주변환경 조화", sortOrder: 1 }],
      },
    },
    include: { children: true },
  });

  await prisma.evaluationItem.create({
    data: {
      categoryId: urbanContext.children[0].id,
      detailItem: "건축물 스케일 적정성",
      points: 10,
      description: "주변 건축물 높이, 가로 폭, 조망축을 고려한 규모 계획 여부",
      criteria: "주변 스카이라인과 과도한 단절 없이 입면과 매스가 분절되어야 한다.",
      sortOrder: 1,
    },
  });

  await prisma.law.createMany({
    data: [
      {
        title: "경관법",
        article: "제28조",
        jurisdiction: "국토교통부",
        summary: "경관심의 대상과 기준에 관한 사항",
      },
      {
        title: "서울특별시 경관 조례",
        article: "제18조",
        jurisdiction: "서울특별시",
        summary: "색채 및 건축경관 심의 기준",
      },
    ],
    skipDuplicates: true,
  });

  await prisma.guideline.createMany({
    data: [
      {
        title: "도시 스카이라인 관리지침",
        section: "3.2",
        summary: "주요 조망축과 높이 변화 관리",
      },
      {
        title: "경관심의 제출도서 체크리스트",
        section: "1.1",
        summary: "필수 도면과 시각자료 제출 기준",
      },
    ],
    skipDuplicates: true,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
