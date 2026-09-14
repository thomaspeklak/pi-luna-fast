import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Explicitly loaded into native children; not a parent extension entrypoint. */
export default function lunaChildFast(pi: ExtensionAPI): void {
  pi.on("before_provider_request", (event, ctx) => {
    if (ctx.model?.provider !== "openai-codex" || ctx.model.id !== "gpt-5.6-luna") return undefined;
    if (typeof event.payload !== "object" || event.payload === null || Array.isArray(event.payload)) {
      throw new Error("Luna priority policy requires an object provider payload.");
    }
    return { ...event.payload, service_tier: "priority" };
  });
}
