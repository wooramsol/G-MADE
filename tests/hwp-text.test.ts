import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import CFB from "cfb";
import { zipSync, strToU8 } from "fflate";
import { extractHwpText } from "../lib/law/hwp-text";

function paraTextRecord(text: string): Buffer {
  // 확장 제어(표 시작 등, 8칸)를 앞에 넣어 제어문자 건너뛰기도 검사
  const control = Buffer.alloc(16);
  control.writeUInt16LE(11, 0);
  const body = Buffer.concat([control, Buffer.from(text + "\r", "utf16le")]);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(67 | (body.length << 20), 0);
  return Buffer.concat([header, body]);
}

test("HWP 5.0 본문 글자 추출 (압축 + 제어문자)", () => {
  const container = CFB.utils.cfb_new();
  const fileHeader = Buffer.alloc(256);
  fileHeader.write("HWP Document File", 0, "ascii");
  fileHeader.writeUInt32LE(1, 36); // 압축
  CFB.utils.cfb_add(container, "/FileHeader", fileHeader);
  const section = Buffer.concat([paraTextRecord("[별표 3] 색채 심의기준"), paraTextRecord("외벽은 저채도 색상을 사용한다.")]);
  CFB.utils.cfb_add(container, "/BodyText/Section0", deflateRawSync(section));
  const bytes = CFB.write(container, { type: "buffer" }) as Buffer;
  const text = extractHwpText(new Uint8Array(bytes));
  assert.match(text, /색채 심의기준/);
  assert.match(text, /저채도 색상을 사용한다/);
});

test("HWPX 본문 글자 추출", () => {
  const xml = '<hs:sec><hp:p><hp:run><hp:t>조명 심의기준</hp:t></hp:run></hp:p><hp:p><hp:t>눈부심 없는 조명</hp:t></hp:p></hs:sec>';
  const zip = zipSync({ "Contents/section0.xml": strToU8(xml), mimetype: strToU8("application/hwp+zip") });
  const text = extractHwpText(zip);
  assert.match(text, /조명 심의기준\n눈부심 없는 조명/);
});

test("한컴 전용 글머리 기호를 일반 글머리표로", async () => {
  const { replaceHwpBullets } = await import("../lib/law/hwp-text");
  assert.equal(replaceHwpBullets("인근 건축물과 조화"), "• 인근 건축물과 조화");
});
