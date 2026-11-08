export const config = {
  apiBase: "https://api.github.com",
  userAgent: "github-user-cli",
  timeoutMs: 10_000,
  maxAttempts: 3,
  baseDelayMs: 500,
  cacheDir: ".cache",
  cacheTtlMs: 10 * 60 * 1000,
  topRepos: 5,
};
