# Security

Pi extensions execute with the user's permissions. Review the source and pinned dependencies before installation. This package does not sandbox children or guarantee provider scheduling.

The package does not read credentials or transmit telemetry. Global commands update the `lunaFast` section of Pi's user settings, preserving other keys. Session commands persist a boolean override (or reset) as a Pi custom session entry; request bodies and model output are not logged by this package. Pi and the configured provider handle authentication and network requests normally. The extension changes the service tier of matching child requests, which can affect billing or quota.

Do not attach credentials, raw request bodies, or session transcripts to issues. For a vulnerability, use GitHub's private vulnerability reporting feature if enabled. If it is unavailable, open an issue asking for a private contact channel without disclosing exploit details or sensitive data.

Security fixes target the current main branch; older revisions are not maintained separately.
