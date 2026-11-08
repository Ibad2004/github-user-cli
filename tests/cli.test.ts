import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { cachePath } from "../src/cache.js";
import { run } from "../src/cli.js";
import type { FetchFn } from "../src/github.js";

interface Reply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

type Route = Reply | Error | (Reply | Error)[];

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const MINUTE = 60_000;
const USER_PATH = "/users/octo";
const REPOS_PATH = "/users/octo/repos?per_page=100";

const USER = {
  login: "octo",
  name: "Octo Cat",
  location: "Earth",
  bio: "Hello",
  followers: 1234,
  following: 5,
  public_repos: 7,
  created_at: "2011-01-25T18:44:36Z",
};

const repo = (name: string, stars: number, language: string | null = "TypeScript") => ({
  name,
  stargazers_count: stars,
  language,
  description: `${name} description`,
});

function fakeFetch(routes: Record<string, Route>): { fetchFn: FetchFn; calls: string[]; agents: string[] } {
  const calls: string[] = [];
  const agents: string[] = [];
  const fetchFn: FetchFn = (url, init) => {
    calls.push(url);
    agents.push(new Headers(init.headers).get("user-agent") ?? "");
    const { pathname, search } = new URL(url);
    const route = routes[pathname + search];
    const reply = Array.isArray(route) ? route.shift() : route;
    if (reply === undefined) return Promise.reject(new Error(`unexpected request ${url}`));
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve(
      new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: reply.headers }),
    );
  };
  return { fetchFn, calls, agents };
}

const ok = (repos: unknown[] = [], user: unknown = USER): Record<string, Route> => ({
  [USER_PATH]: { body: user },
  [REPOS_PATH]: { body: repos },
});

const offline = (): FetchFn => () => Promise.reject(new Error("network must not be used"));

let dir = "";

async function cli(args: string[], fetchFn: FetchFn, now = NOW) {
  let out = "";
  let err = "";
  const code = await run(args, {
    fetchFn,
    sleep: () => Promise.resolve(),
    now: () => now,
    cacheDir: dir,
    out: (text) => {
      out += `${text}\n`;
    },
    err: (text) => {
      err += `${text}\n`;
    },
  });
  return { code, out, err };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "github-user-cli-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("arguments", () => {
  test("--help prints usage and exits 0", async () => {
    const result = await cli(["--help"], offline());
    assert.equal(result.code, 0);
    assert.match(result.out, /Usage: npm start -- <username>/);
  });

  test("no username prints usage and exits 1", async () => {
    const result = await cli([], offline());
    assert.equal(result.code, 1);
    assert.match(result.err, /Usage:/);
  });

  test("empty username is rejected", async () => {
    const result = await cli(["  "], offline());
    assert.equal(result.code, 1);
    assert.match(result.err, /Username cannot be empty/);
  });

  for (const name of ["-octo", "octo-", "oc--to", "oc_to", "oc.to", "a".repeat(40)]) {
    test(`invalid username "${name}" is rejected without a request`, async () => {
      const { fetchFn, calls } = fakeFetch({});
      const result = await cli([name], fetchFn);
      assert.equal(result.code, 1);
      assert.match(result.err, /not a valid GitHub username|too long/);
      assert.equal(calls.length, 0);
    });
  }

  test("a 39-character username with single hyphens is accepted", async () => {
    const name = `a-b${"c".repeat(36)}`;
    const { fetchFn, calls } = fakeFetch({});
    await cli([name], fetchFn);
    assert.equal(calls.length > 0, true);
  });
});

describe("output", () => {
  test("prints the profile and top 5 repos by stars", async () => {
    const repos = [
      repo("a", 1),
      repo("b", 50),
      repo("c", 7),
      repo("d", 3000),
      repo("e", 0),
      repo("f", 20),
      repo("g", 9),
    ];
    const { fetchFn, agents } = fakeFetch(ok(repos));
    const result = await cli(["octo"], fetchFn);
    assert.equal(result.code, 0);
    assert.match(result.out, /Name:\s+Octo Cat/);
    assert.match(result.out, /Login:\s+octo/);
    assert.match(result.out, /Followers:\s+1,234/);
    assert.match(result.out, /Public repos:\s+7/);
    assert.match(result.out, /Joined:\s+2011-01-25/);
    assert.match(result.out, /Top 5 repositories by stars:/);
    const ranked = [...result.out.matchAll(/^ {2}\d\. (\w+)/gm)].map((match) => match[1]);
    assert.deepEqual(ranked, ["d", "b", "f", "g", "c"]);
    assert.match(result.out, /d \(3,000 stars, TypeScript\)/);
    assert.equal(
      agents.every((agent) => agent === "github-user-cli"),
      true,
    );
  });

  test("user with 0 repos", async () => {
    const result = await cli(["octo"], fakeFetch(ok([])).fetchFn);
    assert.equal(result.code, 0);
    assert.match(result.out, /No public repositories\./);
  });

  test("user with fewer than 5 repos shows all of them", async () => {
    const result = await cli(["octo"], fakeFetch(ok([repo("x", 2), repo("y", 1, null)])).fetchFn);
    assert.equal(result.code, 0);
    assert.match(result.out, /Top 2 repositories by stars:/);
    assert.match(result.out, /y \(1 star, -\)/);
  });

  test("missing name, bio and location are shown as -", async () => {
    const bare = {
      login: "octo",
      location: null,
      followers: 0,
      following: 0,
      public_repos: 0,
      created_at: "x",
    };
    const result = await cli(["octo"], fakeFetch(ok([], bare)).fetchFn);
    assert.equal(result.code, 0);
    assert.match(result.out, /Name:\s+-\n/);
    assert.match(result.out, /Location:\s+-\n/);
    assert.match(result.out, /Bio:\s+-\n/);
  });

  test("unexpected API shape gives a clear error", async () => {
    const result = await cli(["octo"], fakeFetch(ok([], { login: "octo" })).fetchFn);
    assert.equal(result.code, 1);
    assert.match(result.err, /Unexpected response from GitHub/);
  });
});

describe("errors", () => {
  test("404 prints User not found", async () => {
    const { fetchFn, calls } = fakeFetch({ [USER_PATH]: { status: 404, body: { message: "Not Found" } } });
    const result = await cli(["octo"], fetchFn);
    assert.equal(result.code, 1);
    assert.match(result.err, /Error: User not found/);
    assert.equal(calls.length, 1);
  });

  for (const status of [403, 429]) {
    test(`rate limit (${status}) shows the reset time and is not retried`, async () => {
      const headers = { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000000" };
      const { fetchFn, calls } = fakeFetch({ [USER_PATH]: { status, headers } });
      const result = await cli(["octo"], fetchFn);
      assert.equal(result.code, 1);
      assert.match(result.err, /rate limit reached\. Try again after 2023-11-14 22:13 UTC/);
      assert.equal(calls.length, 1);
    });
  }

  test("no internet gives a clear message after retrying", async () => {
    const down = new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND api.github.com") });
    const { fetchFn, calls } = fakeFetch({ [USER_PATH]: [down, down, down] });
    const result = await cli(["octo"], fetchFn);
    assert.equal(result.code, 1);
    assert.match(result.err, /Cannot reach GitHub .*ENOTFOUND.*Check your internet connection/);
    assert.equal(calls.length, 3);
  });

  test("timeout gives a clear message", async () => {
    const timeout = new DOMException("aborted", "TimeoutError");
    const result = await cli(["octo"], fakeFetch({ [USER_PATH]: [timeout, timeout, timeout] }).fetchFn);
    assert.equal(result.code, 1);
    assert.match(result.err, /no response within 10 s/);
  });

  test("5xx is retried and can then succeed", async () => {
    const { fetchFn, calls } = fakeFetch({
      [USER_PATH]: [{ status: 502 }, { body: USER }],
      [REPOS_PATH]: { body: [] },
    });
    const result = await cli(["octo"], fetchFn);
    assert.equal(result.code, 0);
    assert.equal(calls.length, 3);
  });

  test("other 4xx is not retried", async () => {
    const { fetchFn, calls } = fakeFetch({ [USER_PATH]: { status: 403 } });
    const result = await cli(["octo"], fetchFn);
    assert.equal(result.code, 1);
    assert.match(result.err, /HTTP 403/);
    assert.equal(calls.length, 1);
  });
});

describe("cache", () => {
  test("a fresh cache is used without a request", async () => {
    const first = await cli(["octo"], fakeFetch(ok([repo("x", 1)])).fetchFn);
    const second = await cli(["OCTO"], offline(), NOW + 9 * MINUTE);
    assert.equal(second.code, 0);
    assert.equal(second.out, first.out);
    assert.match(second.err, /cached result/);
  });

  test("an expired cache is refetched", async () => {
    await cli(["octo"], fakeFetch(ok([repo("old", 1)])).fetchFn);
    const { fetchFn, calls } = fakeFetch(ok([repo("new", 1)]));
    const result = await cli(["octo"], fetchFn, NOW + 10 * MINUTE);
    assert.equal(result.code, 0);
    assert.equal(calls.length, 2);
    assert.match(result.out, /new/);
  });

  for (const { label, content } of [
    { label: "invalid JSON", content: "{not json" },
    { label: "wrong shape", content: JSON.stringify({ savedAt: NOW, data: { user: 1 } }) },
  ]) {
    test(`a broken cache file (${label}) is ignored and replaced`, async () => {
      const path = cachePath(dir, "octo");
      await writeFile(path, content, "utf8");
      const { fetchFn, calls } = fakeFetch(ok());
      const result = await cli(["octo"], fetchFn);
      assert.equal(result.code, 0);
      assert.equal(calls.length, 2);
      const saved: unknown = JSON.parse(await readFile(path, "utf8"));
      assert.deepEqual(saved, { savedAt: NOW, data: { user: USER, repos: [] } });
    });
  }
});
