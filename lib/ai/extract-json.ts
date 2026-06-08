export function extractJsonContent(content: string | undefined): string | undefined {
  if (!content) return undefined;

  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  return trimmed;
}
