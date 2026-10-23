import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "G-MADE HIVE란? | G-MADE HIVE",
};

/** 시스템 소개 — 무엇을 하는 시스템인지, 누가 어떤 단계에서 무엇을 하는지 (로그인 없이 열람 가능) */
export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1100px] space-y-6 px-6 py-10">
        <section className="rounded-md border border-[#d7dee8] bg-white p-6 panel-shadow">
          <p className="text-xs font-bold tracking-wide text-[#2463b3]">경관 · 공공디자인 사전심의 지원</p>
          <h1 className="mt-2 text-2xl font-bold leading-8 text-[#15345b]">G-MADE HIVE란?</h1>
          <p className="mt-3 text-[15px] leading-7 text-[#334155]">
            G-MADE HIVE는 경관·공공디자인 심의를 <b className="text-[#15345b]">AI 에이전트와 인간 전문가가 함께</b> 검토하는
            하이브리드 평가 시스템입니다. 지원자가 심의도서(PDF)를 온라인으로 제출하면, 담당 공무원이 사전검토를 거쳐
            사전심의와 본심의를 진행합니다. 각 심의 단계에서 AI는 경관 체크리스트 항목을 자동으로 판정하고 근거 페이지를
            표시하며, 심사위원 의견은 도서 위에 핀으로 바로 남겨 한 화면에서 함께 볼 수 있습니다.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Feature title="AI 에이전트 분석" body="체크리스트 항목별 충족 여부를 판정하고, 판단 근거가 된 도서 페이지와 위치를 표시합니다. 지형·용도지역·법령 정보도 함께 참고합니다." />
            <Feature title="인간 전문가 분석" body="심사위원별 색 이름표로 도서 위에 의견 핀을 남깁니다. AI 판정을 옆에 두고 비교하며, 의견을 새긴 PDF로 내려받을 수 있습니다." />
            <Feature title="단계별 심의 관리" body="도서접수부터 심의종료까지 5단계로 진행 상황을 관리하고, 단계가 바뀔 때마다 지원자와 공무원에게 알림을 보냅니다." />
          </div>
        </section>

        <section className="rounded-md border border-[#d7dee8] bg-white p-6 panel-shadow">
          <h2 className="text-lg font-bold text-[#15345b]">심의 진행 흐름</h2>
          <p className="mt-1 text-sm text-[#64748b]">단계마다 누가 무엇을 하는지 표시했습니다.</p>
          <div className="mx-auto mt-5 max-w-[720px]">
            <WorkflowDiagram />
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <Role title="지원자" items={["회원가입 후 심의 신청", "도서 PDF 제출 · 보완 도서 제출", "사전심의 결과에 따른 수정 도서 제출", "진행 상황·알림 확인, 신청 철회"]} />
          <Role title="공무원" items={["사전검토: 도서 열람 · 유관부서 지정 · 통과/보완/반려", "사전심의·본심의: AI 분석 실행, 심사위원 의견 입력", "사전심의 결과 통보, 심의 종료 처리"]} />
          <Role title="AI 에이전트" items={["체크리스트 항목별 판정 (충족·부분충족·미충족·확인불가)", "판단 근거 페이지·위치 표시", "수정 도서 재분석과 회차 비교"]} />
        </section>

      </div>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-[#d7dee8] bg-[#f8fafc] p-4">
      <p className="text-sm font-bold text-[#15345b]">{title}</p>
      <p className="mt-1.5 text-[13px] leading-6 text-[#475569]">{body}</p>
    </div>
  );
}

function Role({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-[#d7dee8] bg-white p-5 panel-shadow">
      <p className="text-sm font-bold text-[#15345b]">{title}</p>
      <ul className="mt-2 space-y-1.5 text-[13px] leading-5 text-[#475569]">
        {items.map((item) => (
          <li className="flex gap-1.5" key={item}>
            <span className="text-[#94a3b8]">·</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* 색 — 지원자(초록), 공무원(남색), 세부 작업(회색) */
const C = {
  applicant: { fill: "#ecfdf5", stroke: "#10b981", title: "#065f46", sub: "#047857" },
  official: { fill: "#eef4fc", stroke: "#2463b3", title: "#15345b", sub: "#2463b3" },
  neutral: { fill: "#f8fafc", stroke: "#cbd5e1", title: "#1e293b", sub: "#64748b" },
};
type Tone = keyof typeof C;

function Box({ x, y, w, h, tone, title, lines = [], rx = 8 }: { x: number; y: number; w: number; h: number; tone: Tone; title: string; lines?: string[]; rx?: number }) {
  const c = C[tone];
  const cx = x + w / 2;
  const startY = y + h / 2 - (lines.length * 18) / 2;
  return (
    <g>
      <rect fill={c.fill} height={h} rx={rx} stroke={c.stroke} strokeWidth={0.8} width={w} x={x} y={y} />
      <text dominantBaseline="central" fill={c.title} fontSize={14} fontWeight={700} textAnchor="middle" x={cx} y={startY}>
        {title}
      </text>
      {lines.map((line, index) => (
        <text dominantBaseline="central" fill={c.sub} fontSize={12} key={line} textAnchor="middle" x={cx} y={startY + 19 + index * 18}>
          {line}
        </text>
      ))}
    </g>
  );
}

function Group({ x, y, w, h, title }: { x: number; y: number; w: number; h: number; title: string }) {
  return (
    <g>
      <rect fill={C.official.fill} height={h} rx={12} stroke={C.official.stroke} strokeWidth={0.8} width={w} x={x} y={y} />
      <text dominantBaseline="central" fill={C.official.title} fontSize={14} fontWeight={700} textAnchor="middle" x={x + w / 2} y={y + 22}>
        {title}
      </text>
    </g>
  );
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line markerEnd="url(#about-arrow)" stroke="#64748b" strokeWidth={1.3} x1={x1} x2={x2} y1={y1} y2={y2} />;
}

function WorkflowDiagram() {
  return (
    <svg aria-labelledby="about-flow-title" role="img" viewBox="0 0 680 720" width="100%">
      <title id="about-flow-title">심의 진행 흐름 — 도서접수, 사전검토, 사전심의, 결과 통보와 수정 도서 제출, 본심의, 심의종료</title>
      <defs>
        <marker id="about-arrow" markerHeight={7} markerWidth={7} orient="auto-start-reverse" refX={8} refY={5} viewBox="0 0 10 10">
          <path d="M2 1L8 5L2 9" fill="none" stroke="#64748b" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        </marker>
      </defs>

      <Box h={56} lines={["지원자: 도서 PDF 제출"]} title="1 · 도서접수" tone="applicant" w={240} x={220} y={40} />
      <Arrow x1={340} x2={340} y1={96} y2={132} />

      <Box h={56} lines={["공무원: 열람 · 부서 태그 · 판정"]} title="2 · 사전검토" tone="official" w={240} x={220} y={136} />
      <Box h={72} lines={["공무원: 보완 요청", "지원자: 보완 도서 제출"]} title="보완 요청" tone="applicant" w={150} x={490} y={128} />
      <Arrow x1={460} x2={486} y1={154} y2={154} />
      <Arrow x1={490} x2={464} y1={176} y2={176} />
      <Box h={56} lines={["공무원: 반려 처리"]} title="반려" tone="neutral" w={150} x={40} y={136} />
      <Arrow x1={220} x2={194} y1={164} y2={164} />
      <Arrow x1={340} x2={340} y1={192} y2={228} />

      <Group h={110} title="3 · 사전심의 (통과 도서) — 공무원 진행" w={480} x={100} y={232} />
      <Box h={56} lines={["AI: 체크리스트 자동 판정"]} title="AI 에이전트 분석" tone="neutral" w={210} x={120} y={272} />
      <Box h={56} lines={["공무원: 위원별 핀 의견 입력"]} title="인간 전문가 분석" tone="neutral" w={210} x={350} y={272} />
      <Arrow x1={340} x2={340} y1={342} y2={368} />

      <Box h={56} lines={["공무원: 결과 통보 → 지원자: 수정 도서 제출"]} title="결과 통보 · 수정 도서 제출" tone="applicant" w={320} x={180} y={372} />
      <Arrow x1={340} x2={340} y1={428} y2={454} />

      <Group h={110} title="4 · 본심의 (수정 도서) — 공무원 진행" w={480} x={100} y={458} />
      <Box h={56} lines={["AI: 재분석 · 회차 비교"]} title="AI 에이전트 분석" tone="neutral" w={210} x={120} y={498} />
      <Box h={56} lines={["공무원: 위원별 핀 의견 입력"]} title="인간 전문가 분석" tone="neutral" w={210} x={350} y={498} />
      <Arrow x1={340} x2={340} y1={568} y2={594} />

      <Box h={72} lines={["공무원: 본심의 종료 처리", "지원자: 결과 통지 예정 알림 수신"]} title="5 · 심의종료" tone="neutral" w={280} x={200} y={598} />

      <g fontSize={12}>
        <rect fill={C.applicant.fill} height={14} rx={3} stroke={C.applicant.stroke} width={14} x={150} y={688} />
        <text dominantBaseline="central" fill="#475569" x={172} y={695}>지원자 참여 단계</text>
        <rect fill={C.official.fill} height={14} rx={3} stroke={C.official.stroke} width={14} x={300} y={688} />
        <text dominantBaseline="central" fill="#475569" x={322} y={695}>공무원 진행 단계</text>
        <rect fill={C.neutral.fill} height={14} rx={3} stroke={C.neutral.stroke} width={14} x={450} y={688} />
        <text dominantBaseline="central" fill="#475569" x={472} y={695}>세부 작업 · 결과</text>
      </g>
    </svg>
  );
}
