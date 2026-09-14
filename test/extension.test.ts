import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let directory: string;
const previousDir = process.env.PI_CODING_AGENT_DIR;
before(() => {
  directory = mkdtempSync(join(tmpdir(), "luna-fast-test-"));
  process.env.PI_CODING_AGENT_DIR = directory;
});
after(() => {
  if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousDir;
  rmSync(directory, { recursive: true, force: true });
});
import { fileURLToPath } from "node:url";
import { registerRequiredChildExtensions } from "pi-subagents/required-child-extensions";
import { resolvePiLaunchToolPlan } from "pi-subagents/child-tool-plan";
import registrar from "../src/index.ts";
import policy from "../src/child-policy.ts";

function harness(factory: Function) {
  const handlers = new Map<string, Function>();
  factory({
    on(name: string, handler: Function) { handlers.set(name, handler); },
    registerCommand() {},
  });
  return handlers;
}

const policyPath = fileURLToPath(new URL("../src/child-policy.ts", import.meta.url));

test("parent lifecycle owns one registration and never rewrites parent requests", () => {
  const previous = process.env.PI_SUBAGENT_CHILD;
  delete process.env.PI_SUBAGENT_CHILD;
  const handlers = harness(registrar);
  const sessionId = "luna-fast-test-parent";
  const context = { sessionManager: { getSessionId: () => sessionId, getBranch: () => [] } };
  try {
    assert.equal(handlers.has("before_provider_request"), false);
    handlers.get("session_start")!({}, context);
    assert.throws(() => registerRequiredChildExtensions({ sessionId, extensions: [] }), /already registered/);
    handlers.get("session_shutdown")!();
    handlers.get("session_shutdown")!();
    const replacement = registerRequiredChildExtensions({ sessionId, extensions: [] });
    replacement.dispose();
    handlers.get("session_start")!({}, context);
    assert.throws(() => registerRequiredChildExtensions({ sessionId, extensions: [] }), /already registered/);
  } finally {
    handlers.get("session_shutdown")!();
    if (previous === undefined) delete process.env.PI_SUBAGENT_CHILD;
    else process.env.PI_SUBAGENT_CHILD = previous;
  }
});

test("ambient registrar is inert in detached child processes", () => {
  const previous = process.env.PI_SUBAGENT_CHILD;
  try {
    process.env.PI_SUBAGENT_CHILD = "1";
    assert.equal(harness(registrar).size, 0);
  } finally {
    if (previous === undefined) delete process.env.PI_SUBAGENT_CHILD;
    else process.env.PI_SUBAGENT_CHILD = previous;
  }
});

test("required policy survives explicit extension restrictions", () => {
  const requiredExtensions = [{ id: "luna-priority", path: policyPath }];
  for (const extensions of [undefined, [], ["./optional.ts"]]) {
    const plan = resolvePiLaunchToolPlan({ extensions, requiredExtensions });
    assert.equal(plan.extensionArgs.at(-1), policyPath);
  }
  assert.throws(() => resolvePiLaunchToolPlan({
    requiredExtensions,
    capabilityCeiling: { version: 1, denyExtensions: true, sources: ["test"] },
  }), /denies extensions/);
});

test("Luna policy preserves effort and input while overriding the tier", () => {
  const handler = harness(policy).get("before_provider_request")!;
  const payload = { reasoning: { effort: "max" }, service_tier: "default", input: [] };
  const result = handler({ payload }, { model: { provider: "openai-codex", id: "gpt-5.6-luna" } });
  assert.deepEqual(result, { ...payload, service_tier: "priority" });
  assert.equal(payload.service_tier, "default");
  for (const model of [undefined, { provider: "openai", id: "gpt-5.6-luna" }, { provider: "openai-codex", id: "gpt-5.6-sol" }]) {
    assert.equal(handler({ payload }, { model }), undefined);
  }
});

test("malformed target payloads produce a diagnostic", () => {
  const handler = harness(policy).get("before_provider_request")!;
  for (const payload of [null, [], "invalid"]) {
    assert.throws(() => handler({ payload }, { model: { provider: "openai-codex", id: "gpt-5.6-luna" } }), /object provider payload/);
  }
});
