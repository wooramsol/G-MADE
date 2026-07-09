import type { VisionAsset } from "@/lib/document-content";

/** 분석 대상 업로드 파일 요약 (추출 텍스트 + 비전 자산). */
export type UploadedFileSummary = {
  id?: string;
  originalName: string;
  fileType?: string;
  sizeBytes?: number;
  /** 페이지 마커(--- 「파일명」 p.N ---)가 포함된 추출 본문 */
  extractedTextPreview?: string;
  visionAssets?: VisionAsset[];
  totalPages?: number;
  /** 저장 경로 (Blob key 등) */
  storagePath?: string;
};
