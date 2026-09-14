import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import {
  registerRequiredChildExtensions,
  type RequiredChildExtensionRegistration,
} from "pi-subagents/required-child-extensions";
import { readGlobalEnabled, writeGlobalEnabled } from "./settings.ts";

const policyPath = fileURLToPath(new URL("./child-policy.ts", import.meta.url));
const entryType = "pi-luna-fast:session";
const usage = "Usage: /luna-fast [on|off|reset|global on|global off]";

/** Register child policy without modifying the parent model's requests. */
export default function lunaFast(pi: ExtensionAPI): void {
  if (process.env.PI_SUBAGENT_CHILD === "1") return;

  let registration: RequiredChildExtensionRegistration | undefined;
  let registeredSession: string | undefined;
  let override: boolean | undefined;

  function dispose() {
    registration?.dispose();
    registration = undefined;
    registeredSession = undefined;
  }

  function restore(ctx: ExtensionContext) {
    override = undefined;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== entryType) continue;
      const enabled = (entry.data as { enabled?: unknown } | undefined)?.enabled;
      if (typeof enabled === "boolean") override = enabled;
      else if (enabled === null) override = undefined;
    }
  }

  function refresh(ctx: ExtensionContext) {
    const global = readGlobalEnabled();
    const enabled = override ?? global;
    const sessionId = ctx.sessionManager.getSessionId();
    if (!enabled || registeredSession !== sessionId) dispose();
    if (enabled && !registration) {
      registration = registerRequiredChildExtensions({
        sessionId,
        extensions: [{ id: "luna-priority", path: policyPath }],
      });
      registeredSession = sessionId;
    }
    return `Luna fast: ${enabled ? "on" : "off"} (${override === undefined ? "global default" : "session override"}; global: ${global ? "on" : "off"}). Applies to new child launches.`;
  }

  pi.on("session_start", (_event, ctx) => { restore(ctx); refresh(ctx); });
  pi.on("session_tree", (_event, ctx) => { restore(ctx); refresh(ctx); });
  // Pick up direct edits and global changes made in another parent session.
  pi.on("before_agent_start", (_event, ctx) => { refresh(ctx); });
  pi.on("session_shutdown", dispose);

  pi.registerCommand("luna-fast", {
    description: "Show or set Luna fast mode: on, off, reset, global on/off",
    handler: async (args, ctx) => {
      const command = args.trim().replace(/\s+/g, " ");
      if (!["", "on", "off", "reset", "global on", "global off"].includes(command)) {
        ctx.ui.notify(usage, "error");
        return;
      }
      await ctx.waitForIdle();
      if (command.startsWith("global ")) {
        await writeGlobalEnabled(command === "global on");
      } else if (command) {
        // Validate global settings before persisting a session change.
        readGlobalEnabled();
        override = command === "reset" ? undefined : command === "on";
        pi.appendEntry(entryType, { enabled: override ?? null });
      }
      ctx.ui.notify(refresh(ctx), "info");
    },
  });
}
