# Changelog

## 0.2.0

- Add the global `lunaFast.enabled` setting (defaults to enabled).
- Add `/luna-fast` status, session on/off/reset, and global on/off commands.
- Persist session overrides across resume, fork, and branch navigation.
- Refresh global settings before parent agent runs; existing child launch snapshots remain unchanged.
- Preserve unrelated settings with locked, atomic global writes.

## 0.1.0

- Register a mandatory Luna priority policy through pi-subagents' required child extension API.
- Preserve parent requests, non-Luna models, and reasoning effort.
- Support native child launches with ambient extension discovery disabled.
- Add credential-free tests and CI.
