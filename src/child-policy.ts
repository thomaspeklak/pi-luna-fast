import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { priorityPayload } from "./policy.ts";

/** Explicitly loaded into native children; not a parent extension entrypoint. */
export default function lunaChildFast(pi: ExtensionAPI): void {
  pi.on("before_provider_request", (event, ctx) => priorityPayload(event.payload, ctx.model, "luna"));
}
