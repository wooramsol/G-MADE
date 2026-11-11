# G-MADE HIVE — AI·인간전문가 하이브리드 경관 심의 시스템

경관·공공디자인 심의도서를 온라인으로 접수하고, AI 에이전트 분석과 심사위원 의견을 한 화면에서 함께 검토하는 시스템입니다. AI는 심사를 대체하지 않고 판단을 돕습니다. 최종 결정은 사람이 합니다.

## 심의 흐름 (5단계)

1. **도서접수** — 지원자가 심의도서(PDF) 제출
2. **사전검토** — 공무원이 도서 열람, 유관부서 지정, 통과/보완요청/반려
3. **사전심의** — AI 에이전트 분석 + 인간 전문가(심사위원) 핀 의견
4. **본심의** — 사전심의 결과 통보 후 지원자가 낸 수정 도서로 다시 AI·전문가 분석
5. **심의종료** — 결과는 별도 통지

## 역할

| 역할 | 할 수 있는 일 |
|---|---|
| 지원자 | 회원가입, 신청, 도서 제출·보완, 진행 상황 확인, 철회 (자기 신청만) |
| 공무원 | 사전검토 판정, AI 분석 실행, 심사위원 의견 입력, 단계 진행 |
| 관리자 | 공무원 업무 전체 + 계정 발급·관리 |

## AI 분석이 하는 일

- 도서의 경관 체크리스트 항목을 추출해 항목별로 충족·부분충족·미충족·확인불가 판정
- 판단 근거가 된 페이지와 위치 표시 (글자 근거 / 이미지 관찰 근거 구분)
- 사업지 관할 법령·조례·별표(HWP) 원문을 조회해 항목과 대조
- 용도지역을 조회해 건폐율·용적률을 지역 도시계획 조례 기준과 자동 비교 (코드 계산)
- 수정 도서 재분석 시 바뀐 부분만 다시 판단하고 회차 비교

## 기술 구성

- **웹**: Next.js(App Router) · React · TypeScript · Tailwind CSS, Vercel 배포(서울 리전)
- **데이터**: PostgreSQL(Prisma) — 프로젝트(`managed_projects`), 분석 결과(`managed_project_reviews`), 계정, 알림
- **파일**: Cloudflare R2 — 심의도서 PDF, 전문가 의견, 근거 캡처, 법령 원문 보관본
- **AI**: Anthropic Claude API
- **외부 조회**: 국가법령정보센터(법령·자치법규·별표), 브이월드(용도지역·필지·건물·지형)

## 환경변수

| 이름 | 용도 |
|---|---|
| `DATABASE_URL` / `POSTGRES_URL` | PostgreSQL 연결 |
| `AUTH_SECRET` | 로그인 세션 암호화 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | 기본 관리자 계정 |
| `CLAUDE_API_KEY` | AI 분석 |
| `CLAUDE_MODEL` / `CLAUDE_FAST_MODEL` | (선택) 평가 모델 / 보조 모델 교체 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | 파일 저장소 |
| `LAW_OC` / `LAW_REFERER` | 국가법령정보센터 |
| `VWORLD_API_KEY` / `VWORLD_DOMAIN` | 브이월드 |

## 개발

```bash
npm ci
npx prisma generate
npm run dev        # 개발 서버
npm test           # 자동 테스트
npm run lint       # 린트
npx tsc --noEmit   # 타입 검사
```

main에 올리면 Vercel이 빌드 중에 자동 테스트와 타입 검사를 돌리고, 실패하면 배포하지 않습니다.

## 알아둘 점

- 프로젝트 본문은 JSON으로 저장하고, 수정은 행 잠금 안에서 처리해 동시 수정이 서로를 덮어쓰지 않습니다.
- 지원자에게는 AI 분석 결과·심사위원·유관부서 등 내부 자료를 서버에서 걸러 보냅니다.
- 화면 최소 폭은 1280px입니다 (더 좁으면 가로 스크롤 또는 축소).
- `prisma/schema.prisma`에는 초기 설계의 표가 남아 있습니다. 실제로 쓰는 것은 계정·역할·로그인 이력·알림·`managed_projects`·`managed_project_reviews`입니다.
