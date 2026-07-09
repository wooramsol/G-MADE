# G-MADE 대화 맥락 정리 (Cursor → Claude 이관용)

> 작성일: 2026-07-09  
> 저장소: https://github.com/wooramsol/G-MADE  
> 운영 URL: https://g-made.vercel.app  
> 기준 브랜치: `main` (PR #102 머지·배포 완료)

---

## 1. 프로젝트 목적

경관사전심의·경관심의·공공디자인심의 등 **도시경관 심의 업무**를 지원하는 AI 기반 하이브리드 평가 시스템.

- AI는 심사를 **대체하지 않고** 심사위원 판단을 **보조**
- 공무원·심사위원이 이해하기 쉬운 UI (세종시 FGI/설문 요구와 유사한 체크리스트·오류·누락·법령 흐름)
- Gemini · ChatGPT · Claude **3 AI 종합(ensemble)** 평가 + 전문가 가중치

---

## 2. 사용자 요청 흐름 (시간순)

### Phase 1–3: 사전검토 패널·체크리스트·공무원 UX

1. **사전검토 결과 패널** — 오류·누락 / 체크리스트 / 법령·지침 3탭
2. **세종시 스타일 체크리스트** — 장별 진행률, 반영/미반영
3. **필수 도면 확인 3단계** — 「도면 확인」 / 「언급만」 / 「누락」
4. **종합결과 탭** — ④ 종합결과 + 인쇄/PDF
5. **중복 제거** — 누락 도면 이슈·actionItemCount 중복 해소
6. **공무원 UX 단순화** — 종합결과 우선 탭, ①② 번호 제거, 배지·상태 문구 완화

### 도면 페이지 오인식 버그

- **증상**: 11개 문서 모두 「도면 확인」이 p.2(목차)부터 표시
- **원인**: 목차 페이지를 도면 페이지로 오인
- **수정**: `isTocPageText` + `scoreDrawingPageText` + `parsePageBlocks` split 방식 (PR #101)

### 전체 재구성 방향 (진행 중)

사용자: *「전체적으로 다시 만들어보자」*

**1단계 (완료)**: PDF 첨부 → 분석 클릭 시 **페이지별 인식 결과**를 AI 평가 **전에** 상세 표시  
→ PR #102, Production 배포 완료

**2단계 이후 (미착수)**: 페이지 인식 검증 후 사전검토·평가 UX 전체 재구성

### Cursor → Claude 이관

- 코드·배포는 GitHub/Vercel에 있으므로 **재세팅 불필요**
- **대화 맥락만** Claude 쪽으로 넘기면 됨 (본 문서)

---

## 3. 머지된 PR 요약

| PR | 브랜치 | 내용 |
|----|--------|------|
| #94 | `cursor/pre-review-results-panel-87a3` | 사전검토 3탭 패널 |
| #96 | `cursor/checklist-ui-sejong-style-87a3` | 세종 스타일 체크리스트 |
| #97 | `cursor/fix-required-doc-check-87a3` | 도면 확인 3-tier |
| #98 | `cursor/pre-review-summary-tab-87a3` | 종합결과 탭 |
| #99 | `cursor/dedupe-pre-review-ui-87a3` | 중복 이슈·집계 제거 |
| #100 | `cursor/simplify-officer-ux-87a3` | 공무원 UX 단순화 |
| #101 | `cursor/fix-drawing-page-detection-87a3` | 목차 제외·실제 도면 페이지만 |
| **#102** | `cursor/page-inventory-87a3` | **PDF 페이지별 인식 결과** |

---

## 4. 현재 UI 구조 (PR #100~#102 기준)

### 사전검토 패널 (`app/projects/[id]/pre-review-results-panel.tsx`)

탭 순서: **종합결과 → 체크리스트 → 오류·누락 → 법령·지침**

- 배지: 종합결과(actionItemCount), 오류·누락(누락 도면 + 고우선 이슈)만
- 상태 라벨: `자동 점검 통과` / `보완 권고` / `추가 확인 필요`

### 페이지 인식 결과 (PR #102)

- **분석 중**: `AnalysisBlockingOverlay`에 페이지별 분류·미리보기 표시 (AI 평가는 계속)
- **분석 후**: `project-evaluation-workspace.tsx` 상단 `PageInventoryPanel` 영구 표시

페이지 분류: `목차` / `제목·구분` / `도면·본문` / `텍스트` / `비어있음` / `이미지·스캔`

---

## 5. 핵심 코드 위치

| 영역 | 파일 |
|------|------|
| 페이지 인벤토리 빌드 | `lib/ai/page-inventory.ts` |
| 페이지 마커·목차·도면 점수 | `lib/ai/page-citation.ts` |
| PDF 추출 | `lib/document-content.ts` |
| 평가 파이프라인 | `lib/run-evaluation-round.ts` |
| 스트림 이벤트 | `lib/evaluation-analysis-progress.ts` (`page-inventory`) |
| 필수 도면 확인 | `lib/pre-review/required-documents.ts` |
| 사전검토 집계 | `lib/pre-review/build-pre-review-results.ts`, `build-summary-report.ts` |
| AI 이슈 (규칙 중복 없음) | `lib/pre-review/derive-design-issues.ts` |
| 환각 방어 (분석 시) | `lib/ai/grounding-guard.ts` |
| 분석 폼 | `app/parallel-evaluation-form.tsx` |
| 결과 워크스페이스 | `app/projects/[id]/project-evaluation-workspace.tsx` |

---

## 6. 해결된 버그·주의사항

1. **필수 도면 false positive** — 전부 「확인」 → 3-tier + 키워드 강화
2. **`parsePageBlocks` regex** — 첫 줄만 캡처 → split 기반으로 수정 (`page-citation.ts`와 동일)
3. **목차 p.2 도면 오인** — TOC·제목-only 페이지 제외 후 `scoreDrawingPageText >= 3`만 도면으로 인정
4. **사전검토 hallucination** — pre-review는 휴리스틱 레이어; AI 근거는 `grounding-guard` (재검증 없음)

---

## 7. 다음 작업 후보 (사용자 의도)

1. **페이지 인식 결과 검증** — 실제 심의 PDF로 p.N 분류·미리보기가 맞는지 사용자 확인
2. **전체 UX 재구성** — 사전검토·평가 흐름을 「페이지 인식 확인 → 검토」 순으로 재설계
3. (보류) 공무원 메모 on 미반영 항목, 대상 확인 위저드

---

## 8. 로컬 개발·배포

```bash
npm install
cp .env.example .env   # 키 설정
npm run dev
npm test
npm run build
```

- Production: `main` push → Vercel 자동 배포
- 환경 변수: Vercel 대시보드 또는 `.env.example` 참고 (Gemini, OpenAI, Claude, LAW_OC, VWORLD, DATABASE_URL 등)

---

## 9. Claude에서 이어갈 때 첫 지시 예시

```
G-MADE (github.com/wooramsol/G-MADE) main 기준.
docs/conversation-handoff.md 를 읽고 이어서 작업해 주세요.

PDF 페이지별 인식(PR #102)은 배포됐습니다.
실제 PDF로 인식 결과를 검증한 뒤, 사전검토·평가 UX 전체 재구성을 진행합니다.
npm test, npm run build 통과 후 PR 올려 주세요.
```

---

## 10. Cursor 전용 (Claude에서는 무시)

- Cloud Agent 브랜치 규칙: `cursor/<name>-87a3` — **새 작업 시 일반 브랜치명 사용 가능**
- Cursor MCP·Cloud Agent 설정 — 이관 불필요
