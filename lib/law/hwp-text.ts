import { inflateRawSync, inflateSync } from "node:zlib";
import CFB from "cfb";
import { unzipSync, strFromU8 } from "fflate";

/**
 * 한글(HWP 5.0 / HWPX) 파일에서 본문 글자만 뽑는다 — 조례 별표(심의기준표)는 국가법령정보센터에서
 * HWP 첨부로만 제공되므로, 이 글자를 읽어야 실제 기준(색채·조명·조경 등)을 분석에 넣을 수 있다.
 * 표는 셀 순서대로 글자만 이어진다(구조는 잃지만 기준 문구는 남음). 암호·배포용 문서는 읽지 않는다.
 */

const HWPTAG_PARA_TEXT = 0x10 + 51; // 67

export function extractHwpText(bytes: Uint8Array): string {
  // HWPX(zip) 인지 먼저 확인
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return extractHwpxText(bytes);
  const container = CFB.read(Buffer.from(bytes), { type: "buffer" });
  const header = CFB.find(container, "FileHeader");
  if (!header?.content) throw new Error("HWP 파일 머리말이 없습니다.");
  const headerBytes = Buffer.from(header.content as Uint8Array);
  const flags = headerBytes.readUInt32LE(36);
  const compressed = (flags & 0x1) !== 0;
  if ((flags & 0x2) !== 0) throw new Error("암호가 걸린 HWP 파일입니다.");
  if ((flags & 0x4) !== 0) throw new Error("배포용 HWP 파일이라 글자를 읽을 수 없습니다.");

  const sections = container.FullPaths.map((path, index) => ({ path, entry: container.FileIndex[index] }))
    .filter(({ path }) => /BodyText\/Section\d+$/i.test(path))
    .sort((a, b) => Number(a.path.match(/(\d+)$/)?.[1] ?? 0) - Number(b.path.match(/(\d+)$/)?.[1] ?? 0));

  const parts: string[] = [];
  for (const { entry } of sections) {
    if (!entry?.content) continue;
    let data = Buffer.from(entry.content as Uint8Array);
    if (compressed) {
      try {
        data = inflateRawSync(data);
      } catch {
        data = inflateSync(data);
      }
    }
    parts.push(readParaTexts(data));
  }
  return normalize(parts.join("\n"));
}

function readParaTexts(data: Buffer): string {
  const lines: string[] = [];
  let offset = 0;
  while (offset + 4 <= data.length) {
    const head = data.readUInt32LE(offset);
    offset += 4;
    const tag = head & 0x3ff;
    let size = (head >>> 20) & 0xfff;
    if (size === 0xfff) {
      if (offset + 4 > data.length) break;
      size = data.readUInt32LE(offset);
      offset += 4;
    }
    if (offset + size > data.length) break;
    if (tag === HWPTAG_PARA_TEXT) lines.push(decodeParaText(data.subarray(offset, offset + size)));
    offset += size;
  }
  return lines.join("\n");
}

/** 문단 글자 — UTF-16LE, 0~31은 제어문자(문자 제어 1칸, 인라인·확장 제어 8칸) */
function decodeParaText(buffer: Buffer): string {
  let out = "";
  let i = 0;
  const count = Math.floor(buffer.length / 2);
  while (i < count) {
    const code = buffer.readUInt16LE(i * 2);
    if (code < 32) {
      if (code === 10 || code === 13) out += "\n";
      else if (code === 9) out += "\t";
      const single = code === 0 || code === 10 || code === 13 || (code >= 24 && code <= 31);
      i += single ? 1 : 8;
      continue;
    }
    out += String.fromCharCode(code);
    i += 1;
  }
  return out;
}

function extractHwpxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const sectionNames = Object.keys(files)
    .filter((name) => /Contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/i)?.[1] ?? 0) - Number(b.match(/(\d+)\.xml$/i)?.[1] ?? 0));
  const parts = sectionNames.map((name) => {
    const xml = strFromU8(files[name]);
    return xml
      .replace(/<\/hp:p>/g, "\n")
      .replace(/<hp:tab[^>]*\/>/g, "\t")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"');
  });
  return normalize(parts.join("\n"));
}

function normalize(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
