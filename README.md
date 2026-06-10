# G-MADE Hybrid Evaluation System

G-MADE Hybrid Evaluation System은 경관사전심의, 경관심의, 공공디자인심의 등 도시경관 관련 심의 업무를 지원하는 AI 기반 하이브리드 평가 시스템입니다.

## 핵심 원칙

- AI는 심사를 대체하지 않습니다.
- AI는 심사위원의 판단을 지원합니다.
- 최종 결정권자는 인간 심사위원입니다.
- 모든 AI 점수는 설명 가능해야 하며 점수 산정 근거를 추적할 수 있어야 합니다.

## 구현 내용

- Next.js App Router 기반 데스크탑 우선 웹 화면
- 관리자, 심사위원, 공무원 권한 구조 표현
- 프로젝트 등록/파일 업로드/AI 문서 분석 흐름
- DB 기반 평가항목 구조를 반영한 Prisma schema
- AI 평가, 인간 평가, Hybrid Score Engine 순수 계산 로직
- Explainable AI 점수 추적, 법령/지침 연결, 유사사례 추천 화면
- PDF 보고서 구성 항목과 통계 분석 화면

## 기술 스택

- Frontend: Next.js, TypeScript, Tailwind CSS
- Backend: Next.js API Route
- Database ORM: Prisma
- Database: PostgreSQL
- AI: OpenAI API 연동을 위한 구조 준비
- Storage: AWS S3 호환 저장소 환경 변수 구조

## 실행

```bash
npm install
npm run dev
```

## 검증

```bash
npm run lint
npm run build
DATABASE_URL="postgresql://gmade:gmade@localhost:5432/gmade_hybrid_evaluation" npx prisma validate
```

## 데이터 모델

필수 테이블을 Prisma 모델로 정의했습니다.

- users
- roles
- projects
- project_files
- evaluation_categories
- evaluation_items
- ai_evaluations
- human_evaluations
- hybrid_results
- reports
- laws
- guidelines
- case_studies
- settings
- audit_logs

평가항목은 대분류, 중분류, 세부항목, 배점, 설명, 평가기준을 DB에서 관리하는 구조입니다. 화면의 샘플 항목은 초기 seed와 데모 표시를 위한 예시이며, 실제 운영에서는 관리자 화면에서 수정 가능한 레코드로 운용됩니다.

## 파일 업로드와 AI 연동

브라우저 화면의 "자료 업로드 및 AI 자동 분석" 영역에서 파일을 선택하고 분석할 수 있습니다. 업로드 파일은 로컬 개발 환경에서 `storage/uploads` 폴더에 저장됩니다.

API 키가 없으면 데모 AI 분석 결과가 표시됩니다. 실제 ChatGPT/OpenAI 또는 Gemini 분석을 사용하려면 프로젝트 루트에 `.env` 파일을 만들고 아래 값 중 하나를 입력하세요.

```bash
OPENAI_API_KEY="발급받은 OpenAI API 키"
OPENAI_MODEL="gpt-4o-mini"

GEMINI_API_KEY="발급받은 Gemini API 키"
GEMINI_MODEL="gemini-2.5-flash-lite"
```

그 다음 개발 서버를 다시 시작합니다.

```bash
npm run dev
```

## Vercel 배포와 gmadehive.com 연결

팀 공유용으로 가장 빠른 배포 방식은 Vercel입니다.

1. Vercel에서 GitHub 저장소 `G-MADE`를 Import합니다.
2. Production Branch는 **`main`** 을 선택합니다. (`gmadehive.com` 도메인은 Production 배포만 연결됩니다. Preview URL과 코드가 다를 수 있습니다.)
3. Framework Preset은 `Next.js`로 둡니다.
4. Build Command는 `npm run build`, Install Command는 `npm install` 기본값을 사용합니다.
5. API 키 없이도 데모 AI 분석으로 동작합니다. 아래 환경 변수는 Vercel Project Settings > Environment Variables에 **Production** 환경으로 추가합니다.

| 변수 | 값 예시 | 용도 |
| --- | --- | --- |
| `LAW_OC` | (open.law.go.kr 발급 OC) | 국가법령정보센터 Open API 인증 |
| `LAW_REFERER` | `https://www.gmadehive.com` | 법령 API Referer (미설정 시 거부될 수 있음) |
| `OPENAI_API_KEY` 또는 `GEMINI_API_KEY` | (발급 키) | 실제 AI 문서 분석 |

`LAW_OC`가 없으면 업로드 분석 시 **「내장 법령 요약」** 으로 대체되고, 법령 검색 API도 비활성화됩니다. 변수 추가 후 **Redeploy** 해야 반영됩니다.

### DB 테이블 (Prisma)

Vercel Postgres를 연결하면 `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING` 등이 자동 주입됩니다. **배포(Redeploy) 시** `prisma db push`를 시도합니다. 실패해도 **배포 자체는 계속**됩니다.

로그인 히스토리 테이블이 없으면 Vercel Storage → Postgres → **Query** 탭에서 `prisma/sql/login_history.sql` 내용을 한 번 실행합니다.

### 가비아 DNS 설정

Vercel Project Settings > Domains에 아래 도메인을 추가합니다.

- `gmadehive.com`
- `www.gmadehive.com`

가비아 DNS 관리에서 아래 레코드를 설정합니다.

| 타입 | 호스트 | 값 |
| --- | --- | --- |
| A | @ | 76.76.21.21 |
| CNAME | www | cname.vercel-dns.com |

참고: 현재 프로젝트 생성/삭제와 업로드 파일 저장은 데모용 임시 저장 방식입니다. Vercel에서는 서버리스 환경 특성상 장기 보관이 보장되지 않습니다. 운영용으로 사용하려면 PostgreSQL, Firebase, Vercel Blob 같은 영구 저장소를 연결해야 합니다.
