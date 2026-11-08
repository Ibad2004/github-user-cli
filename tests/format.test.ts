import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDate, formatProfile, topRepos } from "../src/format.js";
import { parseRepos, parseUser } from "../src/parse.js";

const user = parseUser({
  login: "octo",
  name: null,
  bio: "  multi\n line  ",
  followers: 0,
  following: 0,
  public_repos: 1,
  created_at: "2020-02-03T00:00:00Z",
});

test("formatDate returns - for an invalid date", () => {
  assert.equal(formatDate("not a date"), "-");
  assert.equal(formatDate("2020-02-03T23:59:59Z"), "2020-02-03");
});

test("topRepos sorts by stars, then name, and does not change the input", () => {
  const repos = parseRepos([
    { name: "b", stargazers_count: 1 },
    { name: "a", stargazers_count: 1 },
    { name: "c", stargazers_count: 5 },
  ]);
  assert.deepEqual(
    topRepos(repos, 2).map((repo) => repo.name),
    ["c", "a"],
  );
  assert.equal(repos[0]?.name, "b");
});

test("formatProfile is pure text with - for missing values", () => {
  const text = formatProfile({ user, repos: parseRepos([{ name: "solo", stargazers_count: 1 }]) }, 5);
  assert.equal(
    text,
    [
      "Name:         -",
      "Login:        octo",
      "Location:     -",
      "Bio:          multi line",
      "Followers:    0",
      "Following:    0",
      "Public repos: 1",
      "Joined:       2020-02-03",
      "",
      "Top repository by stars:",
      "  1. solo (1 star, -)",
      "     -",
    ].join("\n"),
  );
});

test("parseRepos rejects a non-list", () => {
  assert.throws(() => parseRepos({ message: "oops" }), /repos is not a list/);
});
