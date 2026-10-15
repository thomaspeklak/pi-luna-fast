import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// Inspect the pinned registry to verify the actual snapshot carried to launches.
import { resolveRequiredChildExtensions } from "../node_modules/pi-subagents/src/shared/required-child-extensions.ts";
import registrar from "../src/index.ts";
import { readGlobalMode, writeGlobalMode } from "../src/settings.ts";

test("settings modes, legacy defaults, strict validation and non-destructive concurrent writes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "luna-settings-"));
  const path = join(dir, "settings.json");
  try {
    assert.equal(readGlobalMode(path), "luna");
    for (const [enabled, expected] of [[true, "luna"], [false, "off"]] as const) {
      writeFileSync(path, JSON.stringify({ lunaFast: { enabled } }));
      assert.equal(readGlobalMode(path), expected);
    }
    writeFileSync(path, JSON.stringify({ theme: "dark", lunaFast: { enabled: false, extra: 42 } }));
    await Promise.all([writeGlobalMode("off", path), writeGlobalMode("all", path)]);
    const saved = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(saved.theme, "dark");
    assert.equal(saved.lunaFast.extra, 42);
    assert.ok(["off", "all"].includes(saved.lunaFast.mode));
    assert.equal(saved.lunaFast.enabled, undefined, "saving migrates the legacy setting");
    for (const mode of ["all", "luna", "off"] as const) {
      await writeGlobalMode(mode, path);
      assert.equal(readGlobalMode(path), mode);
    }
    writeFileSync(path, JSON.stringify({ lunaFast: { enabled: false, mode: "all" } }));
    assert.equal(readGlobalMode(path), "all", "explicit mode wins over legacy enabled");
    for (const text of [
      '{"lunaFast":{"enabled":"false"}}', '{"lunaFast":false}', '[]',
      ...["on", "ALL", "", true, null, 42].map((mode) => JSON.stringify({ lunaFast: { mode } })),
      '{bad',
    ]) {
      writeFileSync(path, text);
      assert.throws(() => readGlobalMode(path));
    }
    const original = readFileSync(path, "utf8");
    await assert.rejects(writeGlobalMode("all", path));
    await assert.rejects(writeGlobalMode("invalid" as any, path));
    assert.equal(readFileSync(path, "utf8"), original);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("commands control parent requests and immutable child modes, with persistence and restoration", async () => {
  const dir = mkdtempSync(join(tmpdir(), "luna-controls-"));
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  const previousChild = process.env.PI_SUBAGENT_CHILD;
  process.env.PI_CODING_AGENT_DIR = dir;
  delete process.env.PI_SUBAGENT_CHILD;
  const sessions: ReturnType<typeof session>[] = [];
  function session(id: string, initial: any[] = []) {
    const hooks = new Map<string, Function>();
    const entries = [...initial];
    const notifications: string[] = [];
    let command: any;
    registrar({
      on: (name, handler) => hooks.set(name, handler),
      registerCommand: (_name, options) => { command = options; },
      appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
    } as any);
    const ctx = {
      sessionManager: { getSessionId: () => id, getBranch: () => entries },
      waitForIdle: async () => {},
      ui: { notify: (message: string) => notifications.push(message) },
    };
    const result = {
      hooks, entries, notifications, ctx,
      run: (args: string) => command.handler(args, ctx),
      completions: (prefix: string) => command.getArgumentCompletions(prefix),
      snapshot: () => resolveRequiredChildExtensions(id),
      request: (modelId: string, provider = "openai-codex", payload: unknown = {}) =>
        hooks.get("before_provider_request")!({ payload }, { ...ctx, model: { provider, id: modelId } }),
    };
    sessions.push(result);
    hooks.get("session_start")!({}, ctx);
    return result;
  }
  try {
    const a = session("controls-a");
    const b = session("controls-b");
    assert.match(a.snapshot()[0].path, /\/child-policy\.ts$/);
    assert.deepEqual(a.request("gpt-6-luna"), { service_tier: "priority" });
    assert.equal(a.request("gpt-6.1-sol"), undefined);
    const lunaSnapshot = a.snapshot();
    await a.run("all");
    assert.match(a.snapshot()[0].path, /\/child-all-policy\.ts$/);
    assert.match(lunaSnapshot[0].path, /\/child-policy\.ts$/, "captured Luna launches remain Luna-only");
    assert.deepEqual(a.request("gpt-6.1-sol"), { service_tier: "priority" });
    assert.deepEqual(a.request("gpt-6-astra", "openai"), { service_tier: "priority" });
    assert.equal(a.request("claude-sonnet", "anthropic", null), undefined);
    const allSnapshot = a.snapshot();
    await a.run("off");
    assert.equal(a.snapshot().length, 0);
    assert.equal(a.request("gpt-6-luna"), undefined);
    assert.match(allSnapshot[0].path, /\/child-all-policy\.ts$/, "off leaves existing snapshots intact");
    assert.equal(b.snapshot().length, 1);
    await b.run("global off");
    assert.equal(readGlobalMode(), "off");
    assert.equal(b.snapshot().length, 0);
    await a.run("on");
    assert.match(a.snapshot()[0].path, /\/child-policy\.ts$/, "on remains an alias for luna");
    await a.run("");
    assert.match(a.notifications.at(-1)!, /Luna fast: luna \(session override; global: off/);
    await a.run("all");
    const c = session("controls-c", a.entries);
    assert.match(c.snapshot()[0].path, /\/child-all-policy\.ts$/, "resume/fork restores all mode");
    c.entries.length = 0;
    c.hooks.get("session_tree")!({}, c.ctx);
    assert.equal(c.snapshot().length, 0, "tree navigation restores inherited default");
    await a.run("reset");
    assert.equal(a.snapshot().length, 0);
    assert.equal(a.entries.at(-1).data.mode, null);
    await b.run(" global   all ");
    a.hooks.get("before_agent_start")!({}, a.ctx);
    assert.match(a.snapshot()[0].path, /\/child-all-policy\.ts$/);
    assert.match(b.snapshot()[0].path, /\/child-all-policy\.ts$/);
    await a.run("luna");
    await b.run("global off");
    a.hooks.get("before_agent_start")!({}, a.ctx);
    assert.match(a.snapshot()[0].path, /\/child-policy\.ts$/, "session mode overrides new global defaults");
    await a.run("reset");
    await b.run("global luna");
    assert.equal(readGlobalMode(), "luna");
    // Parent requests, including compaction, can occur before before_agent_start.
    assert.deepEqual(a.request("gpt-6-luna"), { service_tier: "priority" });
    assert.equal(a.request("gpt-6.1-sol"), undefined);
    await b.run("global on");
    assert.equal(readGlobalMode(), "luna");
    const count = a.entries.length;
    for (const invalid of ["global maybe", "all off", "global reset", "ALL"]) {
      await a.run(invalid);
      assert.match(a.notifications.at(-1)!, /Usage:/);
    }
    assert.equal(a.entries.length, count);
    assert.equal(readGlobalMode(), "luna");
    assert.deepEqual(a.completions("global l"), [{ value: "global luna", label: "global luna" }]);
    assert.equal(a.completions("invalid"), null);
    const legacy = session("controls-legacy", [
      { type: "custom", customType: "pi-luna-fast:session", data: { enabled: false } },
    ]);
    assert.equal(legacy.snapshot().length, 0);
    legacy.entries.push({ type: "custom", customType: "pi-luna-fast:session", data: { enabled: true } });
    legacy.hooks.get("session_tree")!({}, legacy.ctx);
    assert.match(legacy.snapshot()[0].path, /\/child-policy\.ts$/);
    legacy.entries.push({ type: "custom", customType: "pi-luna-fast:session", data: { enabled: null } });
    legacy.hooks.get("session_tree")!({}, legacy.ctx);
    await legacy.run("");
    assert.match(legacy.notifications.at(-1)!, /global default/);
    writeFileSync(join(dir, "settings.json"), '{"lunaFast":{"mode":"invalid"}}');
    const before = a.entries.length;
    await assert.rejects(a.run("all"));
    assert.equal(a.entries.length, before, "invalid settings prevent session writes");
  } finally {
    for (const s of sessions) s.hooks.get("session_shutdown")!();
    if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousDir;
    if (previousChild === undefined) delete process.env.PI_SUBAGENT_CHILD;
    else process.env.PI_SUBAGENT_CHILD = previousChild;
    rmSync(dir, { recursive: true, force: true });
  }
});
