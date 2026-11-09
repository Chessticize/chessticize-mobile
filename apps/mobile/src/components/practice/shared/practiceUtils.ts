const ANALYSIS_DEPTH = 20;

function safeTestId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

const FABRIC_SAFE_HIDDEN_TEXT_STYLE = {
  // Android Fabric rejects zero-sized fonts even when the Text is fully hidden.
  fontSize: 1,
  height: 0,
  opacity: 0,
  width: 0
} as const;
