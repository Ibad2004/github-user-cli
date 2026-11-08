import { setTimeout as delay } from "node:timers/promises";
import { config } from "./config.js";

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface RequestOptions {
  fetchFn?: FetchFn | undefined;
  sleep?: ((ms: number) => Promise<unknown>) | undefined;
  maxAttempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
}

export interface ProfileData {
  user: unknown;
  repos: unknown;
}

export class AppError extends Error {
  override name = "AppError";
}

class RetryableError extends AppError {}

function describeNetworkError(error: unknown, timeoutMs: number): string {
  if (!(error instanceof Error)) return String(error);
  if (error.name === "TimeoutError") return `no response within ${timeoutMs / 1000} s`;
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
}

function formatReset(raw: string | null): string {
  const seconds = Number(raw);
  if (raw === null || !Number.isFinite(seconds) || seconds <= 0) return "an unknown time";
  return `${new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

const isRateLimited = (response: Response): boolean =>
  (response.status === 403 || response.status === 429) &&
  response.headers.get("x-ratelimit-remaining") === "0";

async function attemptOnce(url: string, fetchFn: FetchFn, timeoutMs: number): Promise<unknown> {
  let response: Response;
  let text: string;
  try {
    response = await fetchFn(url, {
      headers: { "User-Agent": config.userAgent, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = response.ok ? await response.text() : "";
  } catch (error) {
    throw new RetryableError(
      `Cannot reach GitHub (${describeNetworkError(error, timeoutMs)}). Check your internet connection.`,
    );
  }
  if (response.status === 404) throw new AppError("User not found");
  if (isRateLimited(response)) {
    throw new AppError(
      `GitHub API rate limit reached. Try again after ${formatReset(response.headers.get("x-ratelimit-reset"))}.`,
    );
  }
  if (response.status >= 500) throw new RetryableError(`GitHub server error (HTTP ${response.status})`);
  if (!response.ok) throw new AppError(`GitHub request failed (HTTP ${response.status})`);
  try {
    const data: unknown = JSON.parse(text);
    return data;
  } catch {
    throw new AppError("GitHub returned invalid JSON");
  }
}

export async function fetchJson(url: string, options: RequestOptions = {}): Promise<unknown> {
  const {
    fetchFn = fetch,
    sleep = delay,
    maxAttempts = config.maxAttempts,
    timeoutMs = config.timeoutMs,
    baseDelayMs = config.baseDelayMs,
  } = options;
  for (let attempt = 1; ; attempt++) {
    try {
      return await attemptOnce(url, fetchFn, timeoutMs);
    } catch (error) {
      if (!(error instanceof RetryableError) || attempt >= maxAttempts) throw error;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

export async function fetchProfileData(username: string, options: RequestOptions = {}): Promise<ProfileData> {
  const base = `${config.apiBase}/users/${encodeURIComponent(username)}`;
  const user = await fetchJson(base, options);
  const repos = await fetchJson(`${base}/repos?per_page=100`, options);
  return { user, repos };
}
