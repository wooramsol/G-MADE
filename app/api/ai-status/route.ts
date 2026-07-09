import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getClaudeStatus, getClaudeModel } from "@/lib/ai/env-keys";
import { DEFAULT_CLAUDE_MODEL } from "@/lib/ai/claude-models";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const claude = getClaudeStatus();

  return NextResponse.json({
    provider: "claude",
    model: getClaudeModel() ?? DEFAULT_CLAUDE_MODEL,
    configured: claude.configured,
    envKey: claude.envKey ?? "CLAUDE_API_KEY",
    acceptedKeys: ["CLAUDE_API_KEY", "ANTHROPIC_API_KEY"],
  });
}
