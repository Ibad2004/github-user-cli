# GitHub user lookup CLI

A small TypeScript command-line tool. Give it a GitHub username and it prints the user's profile and their
top 5 repositories by stars. Results are cached for 10 minutes.

## How to run

```bash
npm install
npm start -- torvalds
npm start -- --help
npm run check   # typecheck + lint + format check + tests
```

Exit code is `0` on success and `1` on any error.

## Example output

```text
Name:         Linus Torvalds
Login:        torvalds
Location:     Portland, OR
Bio:          -
Followers:    331,118
Following:    0
Public repos: 12
Joined:       2011-09-03

Top 5 repositories by stars:
  1. linux (254,826 stars, C)
     Linux kernel source tree
  2. AudioNoise (4,531 stars, C)
     Random digital audio effects
  3. GuitarPedal (2,490 stars, C)
     Linus learns analog circuits
  4. uemacs (2,195 stars, C)
     Random version of microemacs with my private modificatons
  5. test-tlb (1,082 stars, C)
     Stupid memory latency and TLB tester
```

## Requirements

- Node.js 22 or newer (uses the built-in `fetch`)
- No API token needed (unauthenticated GitHub API: 60 requests per hour)

## Project structure

```text
src/
  config.ts   settings: API URL, User-Agent, 10 s timeout, retries, cache folder and TTL
  github.ts   fetch with timeout + retry on network errors / 5xx, error messages
  parse.ts    unknown JSON -> typed User / Repo with type guards
  format.ts   pure text output
  cache.ts    read / write .cache/<username>.json
  cli.ts      argument handling, username check, ties everything together
tests/
  cli.test.ts     end-to-end through run() with a fake fetch and a temp cache folder
  format.test.ts  formatting and parsing units
```

## Edge cases

| Case                                             | Result                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| no username / `--help`                           | usage message (exit 1 / exit 0)                                                 |
| empty or invalid username                        | clear error, no request sent (letters, digits, single `-`, max 39)              |
| user does not exist (404)                        | `Error: User not found`                                                         |
| 0 repos                                          | `No public repositories.`                                                       |
| fewer than 5 repos                               | shows all of them                                                               |
| missing name / bio / location                    | shown as `-`                                                                    |
| rate limit (403/429, `x-ratelimit-remaining: 0`) | message with the reset time in UTC, not retried                                 |
| no internet / timeout                            | retried 3 times, then "Cannot reach GitHub ... Check your internet connection." |
| 5xx                                              | retried with backoff                                                            |
| cache fresh / expired / broken                   | used / refetched / ignored and replaced                                         |

All of these have tests. Tests never touch the real internet.

## What broke

Nothing broke during this build: typecheck, lint, format check and all tests passed on the first full run.

## What I learned

- A rate-limited 403 looks like a normal 403. Only the `x-ratelimit-remaining: 0` header tells them apart.
- Storing the raw API JSON in the cache and running the same parser on it means a broken or changed cache
  file is caught by the same type guards.

- `unknown` plus small type guards gives typed data without any `as` casts.
- Passing `fetch`, `sleep` and `now` in as dependencies makes network, retry and cache expiry easy to test.
- Writing the cache to a temp file and renaming it keeps a half-written file from being read later.
