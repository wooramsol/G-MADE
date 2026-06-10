import { createExplainableAiEvaluations } from "./ai-analysis";
import { createDemoEvaluationRounds } from "./demo-evaluation-rounds";
import { calculateHybridResults, calculateProjectScore } from "./hybrid-evaluation";
import type {
  CaseStudy,
  EvaluationItem,
  ExtractedDocumentSection,
  Guideline,
  HumanEvaluation,
  HybridSettings,
  LawReference,
  Project,
  RoleCode,
} from "./types";

export const PROJECT_NAME = "G-MADE Hybrid Evaluation System";

export const roles: Array<{ code: RoleCode; label: string; authority: string }> = [
  { code: "ADMIN", label: "관리자", authority: "평가항목, 기준, 가중치, 사용자, 통계 관리" },
  { code: "REVIEWER", label: "심사위원", authority: "프로젝트 열람, 평가 수행, 의견 작성, AI 결과 확인" },
  { code: "OFFICER", label: "공무원", authority: "사업 등록, 자료 업로드, 결과 확인, 보고서 출력" },
];

export const hybridSettings: HybridSettings = {
  aiWeight: 30,
  humanWeight: 70,
};

export const evaluationItems: EvaluationItem[] = [
  {
    id: "item-urban-scale",
    majorCategory: "도시맥락",
    middleCategory: "주변환경 조화",
    detailItem: "건축물 스케일 적정성",
    points: 10,
    description: "주변 건축물 높이, 가로 폭, 조망축을 고려한 규모 계획 여부",
    criteria: "주변 스카이라인과 과도한 단절 없이 입면과 매스가 분절되어야 한다.",
    lawIds: ["law-landscape"],
    guidelineIds: ["guide-skyline"],
  },
  {
    id: "item-facade",
    majorCategory: "건축경관",
    middleCategory: "입면 및 형태",
    detailItem: "입면 분절 및 재료 계획",
    points: 10,
    description: "장대 입면 완화, 저층부 개방감, 재료의 공공성 검토",
    criteria: "보행자 시점에서 위압감을 줄이고 재료 변화가 도시 맥락과 조화되어야 한다.",
    lawIds: ["law-landscape"],
    guidelineIds: ["guide-facade"],
  },
  {
    id: "item-color",
    majorCategory: "건축경관",
    middleCategory: "색채계획",
    detailItem: "주조색과 강조색의 조화",
    points: 10,
    description: "색채 팔레트, 반사율, 주변 경관색과의 관계 검토",
    criteria: "과도한 고채도 색상은 지양하고 주변 도시색과 연속성을 확보해야 한다.",
    lawIds: ["law-ordinance"],
    guidelineIds: ["guide-color"],
  },
  {
    id: "item-nightscape",
    majorCategory: "야간경관",
    middleCategory: "조명계획",
    detailItem: "눈부심 저감 및 안전성",
    points: 10,
    description: "휘도, 색온도, 보행 안전 조도, 빛공해 저감 대책 검토",
    criteria: "조명은 안전을 확보하되 인접 주거지와 운전자에게 눈부심을 유발하지 않아야 한다.",
    lawIds: ["law-light"],
    guidelineIds: ["guide-night"],
  },
  {
    id: "item-walk",
    majorCategory: "공공성",
    middleCategory: "보행동선",
    detailItem: "보행 접근성과 연속성",
    points: 10,
    description: "대중교통, 공개공지, 주변 가로와 연결되는 보행체계 검토",
    criteria: "주 출입구와 공개공간은 보행약자를 포함한 이용자가 직관적으로 접근 가능해야 한다.",
    lawIds: ["law-universal"],
    guidelineIds: ["guide-walk"],
  },
  {
    id: "item-green",
    majorCategory: "환경경관",
    middleCategory: "녹지계획",
    detailItem: "녹지 네트워크 및 생태성",
    points: 10,
    description: "가로수, 공개공지 식재, 생태면적, 유지관리 계획 검토",
    criteria: "단절된 장식 식재가 아니라 주변 녹지축과 연결되는 계획이어야 한다.",
    lawIds: ["law-green"],
    guidelineIds: ["guide-green"],
  },
  {
    id: "item-public-space",
    majorCategory: "공공성",
    middleCategory: "공공공간",
    detailItem: "공개공지 활용성과 체류성",
    points: 10,
    description: "휴게, 그늘, 안내체계, 공공시설물 배치 검토",
    criteria: "공개공지는 실질적으로 이용 가능한 체류 공간으로 계획되어야 한다.",
    lawIds: ["law-public-design"],
    guidelineIds: ["guide-public-space"],
  },
  {
    id: "item-context-document",
    majorCategory: "자료충실도",
    middleCategory: "제출자료 분석",
    detailItem: "심의자료 완결성",
    points: 10,
    description: "건축개요, 배치도, 입면도, 조감도, 주변현황 자료의 충실도 검토",
    criteria: "AI와 심사위원이 동일한 근거를 확인할 수 있도록 핵심 자료가 누락 없이 제출되어야 한다.",
    lawIds: ["law-admin"],
    guidelineIds: ["guide-document"],
  },
];

export const projects: Project[] = [
  {
    id: "project-001",
    name: "동부역세권 복합문화시설 경관사전심의",
    location: "서울특별시 성동구 왕십리로 222",
    locationPoint: { x: 127.037, y: 37.5613, source: "address" },
    client: "서울도시개발공사",
    designer: "GMA 도시건축사사무소",
    projectType: "복합문화시설",
    scale: "지하 4층 / 지상 18층, 연면적 42,600㎡",
    reviewType: "경관사전심의",
    receivedAt: "2026-06-04",
    status: "접수",
    files: [],
    evaluationRounds: createDemoEvaluationRounds("project-001", 2, evaluationItems, "2026-06-04"),
  },
  {
    id: "project-002",
    name: "서부 수변공원 공공디자인심의",
    location: "서울특별시 마포구 망원한강로 14",
    locationPoint: { x: 126.8965, y: 37.5551, source: "address" },
    client: "마포구청",
    designer: "도시공간연구소",
    projectType: "공공공간",
    scale: "공원 18,200㎡, 보행교 1식",
    reviewType: "공공디자인심의",
    receivedAt: "2026-05-29",
    status: "접수",
    files: [],
  },
  {
    id: "project-003",
    name: "남부 생활SOC 복합센터 경관심의",
    location: "경기도 성남시 수정구 수정로 210",
    locationPoint: { x: 127.1598, y: 37.4513, source: "address" },
    client: "성남시",
    designer: "공공건축기획단",
    projectType: "생활SOC",
    scale: "지상 6층, 연면적 9,800㎡",
    reviewType: "경관심의",
    receivedAt: "2026-05-21",
    status: "접수",
    files: [],
    evaluationRounds: createDemoEvaluationRounds("project-003", 3, evaluationItems, "2026-05-21"),
  },
  {
    id: "project-004",
    name: "북부 산업단지 진입관문 경관개선 심의",
    location: "경기도 고양시 일산동구 고봉로 32",
    locationPoint: { x: 126.7707, y: 37.6889, source: "address" },
    client: "고양도시관리공사",
    designer: "어반링크 디자인랩",
    projectType: "기반시설",
    scale: "진입도로 1.8km, 상징게이트 2개소",
    reviewType: "경관심의",
    receivedAt: "2026-05-18",
    status: "접수",
    files: [],
    evaluationRounds: createDemoEvaluationRounds("project-004", 1, evaluationItems, "2026-05-18"),
  },
  {
    id: "project-005",
    name: "중앙로 보행친화 가로환경 공공디자인심의",
    location: "대전광역시 중구 중앙로 101",
    locationPoint: { x: 127.4215, y: 36.3279, source: "address" },
    client: "대전광역시",
    designer: "공공디자인 스튜디오 봄",
    projectType: "공공공간",
    scale: "가로환경 980m, 쉼터 6개소",
    reviewType: "공공디자인심의",
    receivedAt: "2026-05-14",
    status: "접수",
    files: [],
  },
  {
    id: "project-006",
    name: "해안 문화복합시설 야간경관 사전검토",
    location: "부산광역시 해운대구 해운대해변로 264",
    locationPoint: { x: 129.1604, y: 35.1587, source: "address" },
    client: "부산관광공사",
    designer: "라이트스케이프 건축",
    projectType: "문화시설",
    scale: "지하 2층 / 지상 9층, 연면적 18,400㎡",
    reviewType: "경관사전심의",
    receivedAt: "2026-05-09",
    status: "접수",
    files: [],
    evaluationRounds: createDemoEvaluationRounds("project-006", 2, evaluationItems, "2026-05-09"),
  },
  {
    id: "project-007",
    name: "혁신도시 공공청사 증축 경관심의",
    location: "전북특별자치도 전주시 덕진구 시청로 10",
    locationPoint: { x: 127.148, y: 35.8242, source: "address" },
    client: "전북특별자치도",
    designer: "한빛 공공건축사사무소",
    projectType: "공공청사",
    scale: "지상 8층, 연면적 15,200㎡",
    reviewType: "경관심의",
    receivedAt: "2026-05-02",
    status: "접수",
    files: [],
    evaluationRounds: createDemoEvaluationRounds("project-007", 1, evaluationItems, "2026-05-02"),
  },
  {
    id: "project-008",
    name: "동남권 복합환승센터 경관사전심의",
    location: "서울특별시 송파구 마천로 111",
    locationPoint: { x: 127.1267, y: 37.4784, source: "address" },
    client: "서울교통공사",
    designer: "메트로폴리스 플랜",
    projectType: "교통시설",
    scale: "환승센터 1식, 광장 12,500㎡",
    reviewType: "경관사전심의",
    receivedAt: "2026-04-26",
    status: "접수",
    files: [],
  },
];

export const laws: LawReference[] = [
  { id: "law-landscape", title: "경관법", article: "제28조", summary: "경관심의 대상과 기준에 관한 사항", jurisdiction: "국토교통부" },
  { id: "law-ordinance", title: "서울특별시 경관 조례", article: "제18조", summary: "색채 및 건축경관 심의 기준", jurisdiction: "서울특별시" },
  { id: "law-light", title: "인공조명에 의한 빛공해 방지법", article: "제11조", summary: "조명환경관리구역과 빛방사 허용 기준", jurisdiction: "환경부" },
  { id: "law-universal", title: "장애인등편의법", article: "제8조", summary: "접근로와 편의시설 설치 기준", jurisdiction: "보건복지부" },
  { id: "law-green", title: "도시공원 및 녹지 등에 관한 법률", article: "제35조", summary: "녹지 확보와 도시 생태성 기준", jurisdiction: "국토교통부" },
  { id: "law-public-design", title: "공공디자인의 진흥에 관한 법률", article: "제10조", summary: "공공디자인 심의와 품질관리", jurisdiction: "문화체육관광부" },
  { id: "law-admin", title: "행정절차법", article: "제17조", summary: "신청 서류의 접수와 보완 절차", jurisdiction: "행정안전부" },
];

export const guidelines: Guideline[] = [
  { id: "guide-skyline", title: "도시 스카이라인 관리지침", section: "3.2", summary: "주요 조망축과 높이 변화 관리" },
  { id: "guide-facade", title: "건축물 입면 경관 가이드라인", section: "2.1", summary: "저층부 개방감과 입면 분절" },
  { id: "guide-color", title: "서울색 적용 가이드", section: "4.4", summary: "권역별 주조색과 강조색 운용" },
  { id: "guide-night", title: "야간경관 조명 가이드라인", section: "5.3", summary: "휘도, 색온도, 빛공해 저감" },
  { id: "guide-walk", title: "보행친화도시 설계지침", section: "2.5", summary: "연속 보행축과 교통약자 접근성" },
  { id: "guide-green", title: "도시녹지 네트워크 계획기준", section: "3.1", summary: "가로녹지와 공개공지 식재 연결" },
  { id: "guide-public-space", title: "공공공간 디자인 매뉴얼", section: "6.2", summary: "체류형 공개공지와 시설물 배치" },
  { id: "guide-document", title: "경관심의 제출도서 체크리스트", section: "1.1", summary: "필수 도면과 시각자료 제출 기준" },
];

export const caseStudies: CaseStudy[] = [
  {
    id: "case-001",
    title: "광화문 업무복합 저층부 개방형 경관개선",
    location: "서울특별시 종로구 세종대로 172",
    projectType: "복합업무시설",
    similarityScore: 87,
    keyLearning: "가로변 저층부 투명성과 공개공지 연계가 긍정적으로 평가됨.",
  },
  {
    id: "case-002",
    title: "수변 문화시설 야간경관 개선",
    location: "부산광역시 수영구 광안해변로 219",
    projectType: "문화시설",
    similarityScore: 79,
    keyLearning: "조명 색온도 통일과 눈부심 차폐가 심의 조건으로 제시됨.",
  },
  {
    id: "case-003",
    title: "역세권 생활SOC 보행동선 재구성",
    location: "경기도 성남시 분당구 황새울로 240",
    projectType: "생활SOC",
    similarityScore: 92,
    keyLearning: "대중교통 결절점과 주 출입구의 직관적 연결이 우수 사례로 기록됨.",
  },
];

export const extractedDocumentSections: ExtractedDocumentSection[] = [
  { label: "건축개요", confidence: 96, summary: "용도, 층수, 연면적, 시행자 및 설계자 정보 추출 완료" },
  { label: "배치도", confidence: 91, summary: "주 출입구, 차량 진입, 공개공지 위치와 주변 가로 관계 확인" },
  { label: "입면도", confidence: 88, summary: "저층부 개방감, 입면 분절, 마감재 계획 추출" },
  { label: "조감도", confidence: 84, summary: "주요 조망점에서의 매스와 스카이라인 영향 분석" },
  { label: "색채계획", confidence: 82, summary: "주조색, 보조색, 강조색 팔레트와 반사율 검토" },
  { label: "야간경관", confidence: 78, summary: "조명 위치, 색온도, 눈부심 저감 계획 일부 보완 필요" },
  { label: "보행동선", confidence: 93, summary: "대중교통 및 주변 보행축과의 연결성 확인" },
  { label: "녹지계획", confidence: 86, summary: "가로녹지와 공개공지 식재 연결 계획 확인" },
  { label: "공공공간", confidence: 89, summary: "휴게공간, 안내체계, 공공시설물 배치 확인" },
  { label: "주변현황", confidence: 94, summary: "반경 500m 주요 조망축, 문화재, 보행량 자료 확인" },
];

export const aiEvaluations = createExplainableAiEvaluations({
  project: projects[0],
  items: evaluationItems,
  laws,
  guidelines,
  caseStudies,
});

export const humanEvaluations: HumanEvaluation[] = evaluationItems.map((item, index) => ({
  itemId: item.id,
  reviewerName: index % 2 === 0 ? "김민정 위원" : "박준호 위원",
  score: [90, 86, 92, 78, 88, 91, 82, 85][index] ?? 84,
  comment:
    index % 3 === 0
      ? "계획 방향은 적정하나 실시설계에서 보완 조건을 명확히 제시해야 함."
      : "AI 분석 근거와 대체로 일치하며 현장 맥락 설명을 추가하면 충분함.",
  attachmentName: index === 3 ? "야간조명_보완의견.pdf" : undefined,
}));

export const hybridResults = calculateHybridResults({
  items: evaluationItems,
  aiEvaluations,
  humanEvaluations,
  settings: hybridSettings,
});

export const dashboardStats = {
  waiting: 3,
  inEvaluation: 5,
  averageScore: calculateProjectScore(hybridResults),
};

export const annualStatistics = [
  { label: "2023", landscape: 72.4, publicDesign: 78.1, preliminary: 74.8 },
  { label: "2024", landscape: 75.9, publicDesign: 80.2, preliminary: 77.1 },
  { label: "2025", landscape: 79.8, publicDesign: 82.4, preliminary: 80.6 },
  { label: "2026", landscape: 83.2, publicDesign: 84.1, preliminary: 82.7 },
];
