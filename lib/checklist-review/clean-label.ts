/**
 * 체크리스트 구분·항목 문구 정리 — PDF 글자 레이어에서 딸려 온 깨진 기호 제거.
 * (방점 〮, 전용 글꼴 영역 문자, 제어 문자, 대체 문자, 상자·도형 기호 — 화면에 ▤ □ 같은 모양으로 보임)
 * 서버(추출)와 화면(이미 저장된 결과) 양쪽에서 쓰므로 순수 함수로 유지한다.
 */
export function cleanChecklistLabel(value: string | undefined | null): string {
  return String(value ?? "")
    // 방점(〮 〯)은 가운뎃점 자리에 잘못 들어온 결합 문자 — 앞 글자에 겹쳐 이상한 기호로 보이므로 가운뎃점으로
    .replace(/[\u302e\u302f]/g, "·")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏─-◿-�﻿]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
