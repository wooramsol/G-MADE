import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI 데이터 처리 안내 | G-MADE HIVE",
};

/**
 * 도입 검토 기관 담당자를 위한 데이터 처리 고지 — 심의도서가 어디로 전송·보관되고
 * 언제 삭제되는지를 한 페이지로 답합니다. 로그인 없이 열람 가능(auth.config 공개 경로).
 */
export default function DataProcessingPage() {
  return (
    <main className="mx-auto max-w-[860px] px-6 py-10">
      <h1 className="text-2xl font-bold leading-8 text-[#15345b]">AI 데이터 처리 안내</h1>
      <p className="mt-2 text-sm leading-6 text-[#64748b]">
        G-MADE HIVE가 심의도서(업로드 자료)와 검토 결과를 어떻게 전송·보관·삭제하는지에 대한 안내입니다.
        기관 도입 검토 시 참고하세요. (최종 갱신: 2026. 8.)
      </p>

      <div className="mt-8 space-y-6">
        <section className="rounded-xl border border-[#d7dee8] bg-white p-5">
          <h2 className="text-base font-bold text-[#15345b]">1. 업로드한 심의도서는 어디에 저장되나요?</h2>
          <p className="mt-2 text-sm leading-6 text-[#334155]">
            업로드된 PDF는 서비스 전용 비공개 저장소(Vercel Blob, 접근 시 인증 필요)에 저장됩니다.
            외부에 공개되는 URL이 생성되지 않으며, 로그인한 프로젝트 구성원만 열람할 수 있습니다.
          </p>
        </section>

        <section className="rounded-xl border border-[#d7dee8] bg-white p-5">
          <h2 className="text-base font-bold text-[#15345b]">2. AI 분석 시 문서가 외부로 전송되나요?</h2>
          <p className="mt-2 text-sm leading-6 text-[#334155]">
            체크리스트 검토 시 문서가 Anthropic(Claude) API로 전송되어 분석됩니다. Anthropic의 상용 API
            정책상 API로 전송된 데이터는 기본적으로 AI 모델 학습에 사용되지 않으며, 분석 목적 외로
            보관되지 않습니다. 법령·공간정보 조회는 각각 국가법령정보센터·브이월드 공공 API를 사용하며,
            이때 문서 자체는 전송되지 않고 사업 위치(주소)와 검색어만 전달됩니다.
          </p>
        </section>

        <section className="rounded-xl border border-[#d7dee8] bg-white p-5">
          <h2 className="text-base font-bold text-[#15345b]">3. 데이터는 언제 삭제되나요?</h2>
          <p className="mt-2 text-sm leading-6 text-[#334155]">
            보관 자료와 검토 이력은 담당자가 화면에서 직접 삭제할 수 있으며, 자료 삭제 시 저장소의 실제
            파일(Blob)도 함께 삭제됩니다. 프로젝트를 삭제하면 소속된 검토 기록이 함께 정리됩니다.
            별도 요청 시 계정·프로젝트 단위 일괄 파기를 지원합니다.
          </p>
        </section>

        <section className="rounded-xl border border-[#d7dee8] bg-white p-5">
          <h2 className="text-base font-bold text-[#15345b]">4. AI 판정의 법적 효력</h2>
          <p className="mt-2 text-sm leading-6 text-[#334155]">
            AI 검토 결과는 담당 공무원의 사전검토를 보조하는 참고 자료이며 법적 효력이 없습니다.
            신뢰도가 낮은 판정에는 &ldquo;확인 필요&rdquo; 표시가 붙으며, 최종 판단은 담당 공무원과
            심의위원회에 있습니다. 보완요구서 초안 역시 발송 전 담당자 검토·수정을 전제로 합니다.
          </p>
        </section>

        <section className="rounded-xl border border-[#d7dee8] bg-white p-5">
          <h2 className="text-base font-bold text-[#15345b]">5. 문의</h2>
          <p className="mt-2 text-sm leading-6 text-[#334155]">
            데이터 처리·보안에 대한 추가 문의는 G-MADE HIVE 운영지원팀(admin@gmadehive.com)으로
            연락해 주세요. 기관 요구 시 처리 흐름도·보안 점검 자료를 제공합니다.
          </p>
        </section>
      </div>
    </main>
  );
}
