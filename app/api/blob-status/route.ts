import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getBlobUploadStatus } from "@/lib/blob-upload-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  return NextResponse.json(getBlobUploadStatus());
}
