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
