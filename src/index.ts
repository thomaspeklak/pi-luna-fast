import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import {
  registerRequiredChildExtensions,
  type RequiredChildExtensionRegistration,
} from "pi-subagents/required-child-extensions";
import { readGlobalMode, writeGlobalMode } from "./settings.ts";
import { isFastMode, priorityPayload, type FastMode } from "./policy.ts";

const policyPaths = {
  luna: fileURLToPath(new URL("./child-policy.ts", import.meta.url)),
  all: fileURLToPath(new URL("./child-all-policy.ts", import.meta.url)),
};
const entryType = "pi-luna-fast:session";
const commands = ["all", "luna", "off", "on", "reset", "global all", "global luna", "global off", "global on"];
const usage = "Usage: /luna-fast [all|luna|off|on|reset|global all|global luna|global off|global on]";

/** Apply live parent settings and register immutable child-mode snapshots. */
export default function lunaFast(pi: ExtensionAPI): void {
  if (process.env.PI_SUBAGENT_CHILD === "1") return;

  let registration: RequiredChildExtensionRegistration | undefined;
  let registeredSession: string | undefined;
  let registeredMode: FastMode | undefined;
  let override: FastMode | undefined;

  function dispose() {
    registration?.dispose();
    registration = undefined;
    registeredSession = undefined;
    registeredMode = undefined;
  }

  function restore(ctx: ExtensionContext) {
    override = undefined;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== entryType) continue;
      const data = entry.data as { mode?: unknown; enabled?: unknown } | undefined;
      if (isFastMode(data?.mode)) override = data.mode;
      else if (data?.mode === null) override = undefined;
      else if (data?.mode === undefined) {
        // Restore histories written before the three-state switch existed.
        if (typeof data?.enabled === "boolean") override = data.enabled ? "luna" : "off";
        else if (data?.enabled === null) override = undefined;
      }
    }
  }

  function refresh(ctx: ExtensionContext) {
    const global = readGlobalMode();
    const mode = override ?? global;
    const sessionId = ctx.sessionManager.getSessionId();
    if (mode === "off" || registeredSession !== sessionId || registeredMode !== mode) dispose();
    if (mode !== "off" && !registration) {
      registration = registerRequiredChildExtensions({
        sessionId,
        extensions: [{ id: "luna-priority", path: policyPaths[mode] }],
      });
      registeredSession = sessionId;
      registeredMode = mode;
    }
    return `Luna fast: ${mode} (${override === undefined ? "global default" : "session override"}; global: ${global}). Applies to parent requests and new child launches.`;
  }

  pi.on("session_start", (_event, ctx) => { restore(ctx); refresh(ctx); });
  pi.on("session_tree", (_event, ctx) => { restore(ctx); refresh(ctx); });
  // Pick up direct edits and global changes made in another parent session.
  pi.on("before_agent_start", (_event, ctx) => { refresh(ctx); });
  pi.on("session_shutdown", dispose);
  pi.on("before_provider_request", (event, ctx) =>
    priorityPayload(event.payload, ctx.model, override ?? readGlobalMode()));

  pi.registerCommand("luna-fast", {
    description: "Show or set fast mode: all, luna, off, reset, global all/luna/off (on = luna)",
    getArgumentCompletions: (prefix) => {
      const matches = commands.filter((command) => command.startsWith(prefix));
      return matches.length ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const command = args.trim().replace(/\s+/g, " ");
      if (command && !commands.includes(command)) {
        ctx.ui.notify(usage, "error");
        return;
      }
      await ctx.waitForIdle();
      const value = command.startsWith("global ") ? command.slice(7) : command;
      const mode = value === "on" ? "luna" : value;
      if (command.startsWith("global ") && isFastMode(mode)) {
        await writeGlobalMode(mode);
      } else if (command) {
        // Validate global settings before persisting a session change.
        readGlobalMode();
        override = isFastMode(mode) ? mode : undefined;
        pi.appendEntry(entryType, { mode: override ?? null });
      }
      ctx.ui.notify(refresh(ctx), "info");
    },
  });
}
