import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerRequiredChildExtensions } from "pi-subagents/required-child-extensions";
import registrar from "../src/index.ts";
import { readGlobalEnabled, writeGlobalEnabled } from "../src/settings.ts";

test("settings default, strict validation and non-destructive concurrent writes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "luna-settings-"));
  const path = join(dir, "settings.json");
  try {
    assert.equal(readGlobalEnabled(path), true);
    writeFileSync(path, JSON.stringify({ theme: "dark", lunaFast: { extra: 42 } }));
    await Promise.all([writeGlobalEnabled(false, path), writeGlobalEnabled(true, path)]);
    const saved = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(saved.theme, "dark");
    assert.equal(saved.lunaFast.extra, 42);
    assert.equal(typeof saved.lunaFast.enabled, "boolean");
    await writeGlobalEnabled(false, path);
    assert.equal(readGlobalEnabled(path), false);
    for (const text of ['{"lunaFast":{"enabled":"false"}}', '{"lunaFast":false}', '[]', '{bad']) {
      writeFileSync(path, text);
      assert.throws(() => readGlobalEnabled(path));
    }
    const original = readFileSync(path, "utf8");
    await assert.rejects(writeGlobalEnabled(true, path));
    assert.equal(readFileSync(path, "utf8"), original);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("commands, inherited global changes, session persistence and tree restoration", async () => {
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
    let command: Function;
    registrar({
      on: (name, handler) => hooks.set(name, handler),
      registerCommand: (_name, options) => { command = options.handler; },
      appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
    } as any);
    const ctx = {
      sessionManager: { getSessionId: () => id, getBranch: () => entries },
      waitForIdle: async () => {},
      ui: { notify: (message: string) => notifications.push(message) },
    };
    const result = { hooks, entries, notifications, ctx, run: (args: string) => command(args, ctx) };
    sessions.push(result);
    hooks.get("session_start")!({}, ctx);
    return result;
  }
  function registered(id: string) {
    try {
      const probe = registerRequiredChildExtensions({ sessionId: id, extensions: [] });
      probe.dispose();
      return false;
    } catch (error) {
      assert.match(String(error), /already registered/);
      return true;
    }
  }
  try {
    const a = session("controls-a");
    const b = session("controls-b");
    assert.equal(registered("controls-a"), true);
    await a.run("off");
    assert.equal(registered("controls-a"), false);
    assert.equal(registered("controls-b"), true);
    await b.run("global off");
    assert.equal(readGlobalEnabled(), false);
    assert.equal(registered("controls-b"), false);
    await a.run("on");
    assert.equal(registered("controls-a"), true);
    await a.run("");
    assert.match(a.notifications.at(-1)!, /session override; global: off/);
    const c = session("controls-c", a.entries);
    assert.equal(registered("controls-c"), true, "resume/fork restores override");
    c.entries.length = 0;
    c.hooks.get("session_tree")!({}, c.ctx);
    assert.equal(registered("controls-c"), false, "tree navigation restores inherited default");
    await a.run("reset");
    assert.equal(registered("controls-a"), false);
    assert.equal(a.entries.at(-1).data.enabled, null);
    await writeGlobalEnabled(true);
    a.hooks.get("before_agent_start")!({}, a.ctx);
    b.hooks.get("before_agent_start")!({}, b.ctx);
    assert.equal(registered("controls-a"), true);
    assert.equal(registered("controls-b"), true);
    const count = a.entries.length;
    await a.run("global maybe");
    assert.match(a.notifications.at(-1)!, /Usage:/);
    assert.equal(a.entries.length, count);
    assert.equal(readGlobalEnabled(), true);
  } finally {
    for (const s of sessions) s.hooks.get("session_shutdown")!();
    if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousDir;
    if (previousChild === undefined) delete process.env.PI_SUBAGENT_CHILD;
    else process.env.PI_SUBAGENT_CHILD = previousChild;
    rmSync(dir, { recursive: true, force: true });
  }
});
