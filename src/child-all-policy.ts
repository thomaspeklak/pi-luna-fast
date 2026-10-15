import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { priorityPayload } from "./policy.ts";

/** A separate entrypoint captures all mode in retained/nested launch snapshots. */
export default function childAllFast(pi: ExtensionAPI): void {
  pi.on("before_provider_request", (event, ctx) => priorityPayload(event.payload, ctx.model, "all"));
}
