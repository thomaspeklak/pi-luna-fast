# Contributing

Keep the package small and model-specific. Discuss broader provider or configuration changes in an issue first.

1. Use Node.js 24 or newer.
2. Run `npm ci --ignore-scripts`.
3. Add regression tests for behavior changes.
4. Run `npm run check`.
5. Explain the change and verification in your pull request.

Tests must not require provider credentials or billed model calls. Do not commit session transcripts, request bodies, local configuration, credentials, absolute workstation paths, or identifying benchmark artifacts. Use synthetic fixtures.

When updating pi-subagents, verify its public required-child-extension API, registration lifecycle, nested propagation, and fail-closed loading behavior. Record the tested revision and update the lockfile.

Contributions are licensed under the repository's MIT license.
