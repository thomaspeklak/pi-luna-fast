export type FastMode = "all" | "luna" | "off";

export function isFastMode(value: unknown): value is FastMode {
  return value === "all" || value === "luna" || value === "off";
}

/** Shared by the live parent policy and immutable child-mode entrypoints. */
export function priorityPayload(
  payload: unknown,
  model: { provider: string; id: string } | undefined,
  mode: FastMode,
): Record<string, unknown> | undefined {
  if (mode === "off" || !model || !["openai", "openai-codex"].includes(model.provider)) return undefined;
  if (mode === "luna" && !/^gpt-\d+(?:\.\d+)*-luna$/.test(model.id)) return undefined;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Fast priority policy requires an object provider payload.");
  }
  return { ...payload, service_tier: "priority" };
}
