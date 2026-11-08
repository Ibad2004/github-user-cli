import { pathToFileURL } from "node:url";
import { cachePath, readCache, writeCache } from "./cache.js";
import { config } from "./config.js";
import { formatProfile } from "./format.js";
import { AppError, fetchProfileData, type FetchFn } from "./github.js";
import { parseProfile, type Profile } from "./parse.js";

export const USAGE = `Usage: npm start -- <username>

Shows a GitHub user's profile and their top ${config.topRepos} repositories by stars.
Results are cached in ${config.cacheDir}/ for ${config.cacheTtlMs / 60_000} minutes.

Options:
  -h, --help  Show this help`;

const MAX_USERNAME_LENGTH = 39;
const USERNAME_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d]))*$/i;

export interface Deps {
  out: (text: string) => void;
  err: (text: string) => void;
  fetchFn?: FetchFn;
  sleep?: (ms: number) => Promise<unknown>;
  now?: () => number;
  cacheDir?: string;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function validateUsername(username: string): string | null {
  if (username === "") return "Username cannot be empty.";
  if (username.length > MAX_USERNAME_LENGTH) {
    return `Username is too long (max ${MAX_USERNAME_LENGTH} characters).`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return `"${username}" is not a valid GitHub username (letters, digits and single hyphens, not at the start or end).`;
  }
  return null;
}

async function loadProfile(username: string, deps: Deps): Promise<Profile> {
  const path = cachePath(deps.cacheDir ?? config.cacheDir, username);
  const now = deps.now?.() ?? Date.now();
  const cached = await readCache(path, now, config.cacheTtlMs, parseProfile);
  if (cached !== null) {
    deps.err(`(cached result from ${path})`);
    return cached;
  }
  const data = await fetchProfileData(username, { fetchFn: deps.fetchFn, sleep: deps.sleep });
  const profile = parseProfile(data);
  try {
    await writeCache(path, data, now);
  } catch (error) {
    deps.err(`Warning: could not write cache: ${messageOf(error)}`);
  }
  return profile;
}

export async function run(args: string[], deps: Deps): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    deps.out(USAGE);
    return 0;
  }
  const [input] = args;
  if (args.length !== 1 || input === undefined) {
    deps.err(USAGE);
    return 1;
  }
  const username = input.trim();
  const problem = validateUsername(username);
  if (problem !== null) {
    deps.err(`Error: ${problem}\n\n${USAGE}`);
    return 1;
  }
  try {
    deps.out(formatProfile(await loadProfile(username, deps), config.topRepos));
    return 0;
  } catch (error) {
    deps.err(
      `Error: ${error instanceof AppError ? error.message : `unexpected failure: ${messageOf(error)}`}`,
    );
    return 1;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = await run(process.argv.slice(2), {
    out: (text) => console.log(text),
    err: (text) => console.error(text),
  });
}
