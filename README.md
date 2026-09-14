# pi-luna-fast

Request OpenAI priority service ("fast mode") for **`openai-codex/gpt-5.6-luna`** children launched by [pi-subagents](https://github.com/nicobailon/pi-subagents).

The parent session stays unchanged. Other models stay unchanged. Reasoning effort stays unchanged.

> Priority service may consume additional quota or cost more. This package requests `service_tier: "priority"`; it cannot guarantee provider-side scheduling or a particular speedup.

## Requirements

- Node.js 24 or newer.
- [Pi](https://github.com/earendil-works/pi-mono) with the `before_provider_request` extension hook.
- pi-subagents with the **required child extensions** API (introduced in upstream commit `0321e17dc9eaedeb4acb8792e55051597c01254a`).
- An authenticated OpenAI Codex provider with access to Luna.

The npm release of pi-subagents at initial packaging did not export the required API. This package therefore pins its API dependency to a public upstream Git commit. Its dependency does **not** automatically enable the subagent tool: install a compatible pi-subagents extension in Pi as well.

## Install

Install the compatible upstream revision, if needed:

```sh
pi install git:github.com/nicobailon/pi-subagents@6d371748ce9284896d0a72a6be6cd280b357e076
```

Install this extension:

```sh
pi install git:github.com/thomaspeklak/pi-luna-fast
```

Alternatively, from a checkout of this repository:

```sh
npm ci --ignore-scripts
pi install .
```

Restart Pi or run `/reload`. Keep the parent entrypoint enabled in `pi config`.

Disable any previous copy of this policy before enabling this package. Do **not** load `src/child-policy.ts` directly into the parent.

## How it works

1. The parent entrypoint registers a required child extension through `pi-subagents/required-child-extensions`.
2. pi-subagents carries that snapshot into native foreground, background, nested, and recovery launches.
3. The child-only extension checks the resolved provider/model and adds `service_tier: "priority"` immediately before a Luna request.

Required extensions survive an explicit `extensions: []` or extension allowlist. If a capability ceiling prohibits extensions, or the required extension cannot load, pi-subagents rejects the launch rather than dropping the policy.

The policy does not depend on a process marker to identify foreground children. The marker is used only to keep detached runners from registering another parent policy.

## Boundaries

- The registrar must load in the root parent. An entirely extension-free parent has no policy.
- Only native pi-subagents children are covered; external CLI runners and unrelated agents are not.
- This is trusted configuration, not a security boundary. Another extension can deliberately rewrite the payload afterward. Pi's handling of hook errors also remains authoritative.
- The upstream registry allows one registration per parent session. Hosts already registering required child extensions must combine policies into a single registration instead of enabling competing registrars.
- Installing a newer pi-subagents version requires compatibility with the same registry/API contract. The pinned dependency is not automatically upgraded.

For opt-in fast mode instead of a Luna-wide policy, pi-subagents also supports `fast: true` per run or agent.

## Development

```sh
npm ci --ignore-scripts
npm run check
```

Tests use Node's test runner and the pinned public pi-subagents API. They require no credentials and make no model calls. They cover parent lifecycle, child-process guards, required-extension selection, prohibited extensions, model filtering, and payload preservation.

A manual integration check can launch a tiny Luna task in foreground, background, and nested modes with `extensions: []`, then inspect the outgoing payload using a temporary observer. Never publish request bodies, credentials, or session transcripts.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Dependencies retain their own licenses.
