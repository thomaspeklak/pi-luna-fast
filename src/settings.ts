import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";

export function settingsPath(): string {
  const configured = process.env.PI_CODING_AGENT_DIR;
  const agentDir = configured?.startsWith("~/") ? join(homedir(), configured.slice(2)) : configured;
  return join(agentDir ? resolve(agentDir) : join(homedir(), ".pi", "agent"), "settings.json");
}

function readSettings(path: string): Record<string, unknown> {
  let text: string;
  try { text = readFileSync(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Pi settings must be a JSON object.");
  return value;
}

function section(settings: Record<string, unknown>): Record<string, unknown> {
  const value = settings.lunaFast;
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("lunaFast must be an object.");
  return value as Record<string, unknown>;
}

export function readGlobalEnabled(path = settingsPath()): boolean {
  const value = section(readSettings(path)).enabled;
  if (value !== undefined && typeof value !== "boolean") throw new Error("lunaFast.enabled must be a boolean.");
  return value ?? true;
}

/** Coordinate with Pi's settings lock and preserve unrelated settings. */
export async function writeGlobalEnabled(enabled: boolean, path = settingsPath()): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const release = await lockfile.lock(path, { realpath: false, retries: { retries: 10, minTimeout: 20, maxTimeout: 100 } });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const settings = readSettings(path);
    settings.lunaFast = { ...section(settings), enabled };
    writeFileSync(temporary, JSON.stringify(settings, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
    await release();
  }
}
