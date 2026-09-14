import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import {
  registerRequiredChildExtensions,
  type RequiredChildExtensionRegistration,
} from "pi-subagents/required-child-extensions";

const policyPath = fileURLToPath(new URL("./child-policy.ts", import.meta.url));

/** Register child policy without modifying the parent model's requests. */
export default function lunaFast(pi: ExtensionAPI): void {
  // Detached children already carry their root parent's required snapshot.
  if (process.env.PI_SUBAGENT_CHILD === "1") return;

  let registration: RequiredChildExtensionRegistration | undefined;
  pi.on("session_start", (_event, ctx) => {
    registration?.dispose();
    registration = registerRequiredChildExtensions({
      sessionId: ctx.sessionManager.getSessionId(),
      extensions: [{ id: "luna-priority", path: policyPath }],
    });
  });
  pi.on("session_shutdown", () => {
    registration?.dispose();
    registration = undefined;
  });
}
