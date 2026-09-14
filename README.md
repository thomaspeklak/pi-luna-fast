# pi-luna-fast

Request OpenAI priority service ("fast mode") for **OpenAI Codex Luna** children launched by [pi-subagents](https://github.com/nicobailon/pi-subagents).

Matches provider `openai-codex` and model IDs matching `/^gpt-\d+(?:\.\d+)*-luna$/`, such as `gpt-5.6-luna`, `gpt-6-luna`, and `gpt-6.1-luna`. Prefixes, suffix variants, and malformed versions are excluded. Matching a future model name does not guarantee that the provider supports priority service for it.

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

## Enable or disable

Fast mode defaults to **on**. Set the global default in Pi's user `settings.json`:

```json
{
  "lunaFast": { "enabled": false }
}
```

This is a global-only setting, not a project setting. The usual Pi agent directory is used, including `PI_CODING_AGENT_DIR` when configured. Values must be JSON booleans, not strings.

| Command | Effect |
| --- | --- |
| `/luna-fast` | Show effective state, its source, and the global default |
| `/luna-fast on` | Enable for this parent session |
| `/luna-fast off` | Disable for this parent session |
| `/luna-fast reset` | Remove the session override and inherit the global default |
| `/luna-fast global on` | Save an enabled global default |
| `/luna-fast global off` | Save a disabled global default |

Session overrides take precedence over the global default and persist in the session history. Resume and fork restore the override from the current branch; new sessions inherit the global default. `reset` is also recorded in history. Global commands preserve unrelated settings and coordinate writes with Pi's settings lock.

Changes apply to **new child launches**. Already-running children, nested work carrying an existing snapshot, and retained/recovery launches keep their captured policy. Other parent sessions pick up global changes before their next agent run or when `/luna-fast` is used; there is no live cross-process broadcast. Direct settings edits are picked up the same way.

Turning this package off removes its priority policy. It does not override independently requested `fast: true`, provider defaults, or another extension's service-tier setting.

## How it works

1. When enabled, the parent entrypoint registers a required child extension through `pi-subagents/required-child-extensions`.
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

Tests use Node's test runner and the pinned public pi-subagents API. They require no credentials and make no model calls. They cover parent lifecycle, child-process guards, required-extension selection, prohibited extensions, model filtering, payload preservation, global settings, session overrides, and branch restoration.

A manual integration check can launch a tiny Luna task in foreground, background, and nested modes with `extensions: []`, then inspect the outgoing payload using a temporary observer. Never publish request bodies, credentials, or session transcripts.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Dependencies retain their own licenses.
