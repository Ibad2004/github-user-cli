import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const cachePath = (dir: string, username: string): string =>
  join(dir, `${username.toLowerCase()}.json`);

export async function readCache<T>(
  path: string,
  now: number,
  ttlMs: number,
  parse: (data: unknown) => T,
): Promise<T | null> {
  try {
    const entry: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof entry !== "object" || entry === null || !("savedAt" in entry) || !("data" in entry)) {
      return null;
    }
    const age = typeof entry.savedAt === "number" ? now - entry.savedAt : -1;
    if (age < 0 || age >= ttlMs) return null;
    return parse(entry.data);
  } catch {
    return null;
  }
}

export async function writeCache(path: string, data: unknown, now: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify({ savedAt: now, data })}\n`, "utf8");
  await rename(temp, path);
}
