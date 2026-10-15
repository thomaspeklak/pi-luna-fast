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
import allPolicy from "../src/child-all-policy.ts";
import { priorityPayload } from "../src/policy.ts";

function harness(factory: Function) {
  const handlers = new Map<string, Function>();
  factory({
    on(name: string, handler: Function) { handlers.set(name, handler); },
    registerCommand() {},
  });
  return handlers;
}

const policyPath = fileURLToPath(new URL("../src/child-policy.ts", import.meta.url));

test("parent lifecycle owns one registration and applies the default Luna policy", () => {
  const previous = process.env.PI_SUBAGENT_CHILD;
  delete process.env.PI_SUBAGENT_CHILD;
  const handlers = harness(registrar);
  const sessionId = "luna-fast-test-parent";
  const context = { sessionManager: { getSessionId: () => sessionId, getBranch: () => [] } };
  try {
    assert.deepEqual(handlers.get("before_provider_request")!({ payload: {} }, {
      model: { provider: "openai-codex", id: "gpt-6-luna" },
    }), { service_tier: "priority" });
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
  for (const path of [policyPath, fileURLToPath(new URL("../src/child-all-policy.ts", import.meta.url))]) {
    const requiredExtensions = [{ id: "luna-priority", path }];
    for (const extensions of [undefined, [], ["./optional.ts"]]) {
      const plan = resolvePiLaunchToolPlan({ extensions, requiredExtensions });
      assert.equal(plan.extensionArgs.at(-1), path);
    }
    assert.throws(() => resolvePiLaunchToolPlan({
      requiredExtensions,
      capabilityCeiling: { version: 1, denyExtensions: true, sources: ["test"] },
    }), /denies extensions/);
  }
});

test("Luna policy preserves effort and input while overriding the tier", () => {
  const handler = harness(policy).get("before_provider_request")!;
  const payload = { reasoning: { effort: "max" }, service_tier: "default", input: [] };
  for (const id of ["gpt-5.6-luna", "gpt-6-luna", "gpt-6.1-luna", "gpt-12.34.5-luna"]) {
    for (const provider of ["openai", "openai-codex"]) {
      const result = handler({ payload }, { model: { provider, id } });
      assert.deepEqual(result, { ...payload, service_tier: "priority" }, id);
      assert.equal(result.reasoning, payload.reasoning);
      assert.equal(result.input, payload.input);
      assert.equal(payload.service_tier, "default");
    }
  }
  for (const model of [undefined, { provider: "anthropic", id: "gpt-5.6-luna" }, { provider: "openai-codex", id: "gpt-5.6-sol" }]) {
    assert.equal(handler({ payload }, { model }), undefined);
  }
});

test("Luna matching rejects malformed versions, prefixes and suffix variants", () => {
  const handler = harness(policy).get("before_provider_request")!;
  for (const id of [
    "gpt-luna", "gpt--luna", "gpt-.-luna", "gpt-6..1-luna", "gpt-6.-luna",
    "gpt-6-1-luna", "gpt-six-luna", "other-gpt-6-luna", "gpt-6-luna-pro",
    "gpt-6-luna-2026-09-14", "gpt-6-luna:max", "gpt-6-Luna",
  ]) {
    assert.equal(handler({ payload: {} }, { model: { provider: "openai-codex", id } }), undefined, id);
  }
});

test("all mode covers non-Luna OpenAI models without touching other providers", () => {
  const handler = harness(allPolicy).get("before_provider_request")!;
  const payload = { reasoning: { effort: "max" }, input: [], service_tier: "default" };
  for (const provider of ["openai-codex", "openai"]) {
    for (const id of ["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra", "o3"]) {
      assert.deepEqual(handler({ payload }, { model: { provider, id } }), { ...payload, service_tier: "priority" });
    }
  }
  assert.equal(payload.service_tier, "default");
  for (const model of [undefined, ...["anthropic", "google", "azure-openai-responses", "custom-openai"].map((provider) => ({ provider, id: "gpt-6-luna" }))]) {
    assert.equal(handler({ payload: null }, { model }), undefined);
  }
  assert.equal(priorityPayload(null, { provider: "openai-codex", id: "gpt-6-luna" }, "off"), undefined);
});

test("malformed target payloads produce a diagnostic in both child modes", () => {
  for (const factory of [policy, allPolicy]) {
    const handler = harness(factory).get("before_provider_request")!;
    for (const payload of [null, [], "invalid"]) {
      assert.throws(() => handler({ payload }, { model: { provider: "openai-codex", id: "gpt-5.6-luna" } }), /object provider payload/);
    }
  }
});
