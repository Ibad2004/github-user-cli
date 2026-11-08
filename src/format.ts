import type { Profile, Repo } from "./parse.js";

const orDash = (value: string | null): string => value ?? "-";

const formatCount = (value: number): string => value.toLocaleString("en-US");

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "-" : date.toISOString().slice(0, 10);
}

export function topRepos(repos: Repo[], limit: number): Repo[] {
  return [...repos].sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name)).slice(0, limit);
}

function formatRepo(repo: Repo, rank: number): string {
  const stars = `${formatCount(repo.stars)} ${repo.stars === 1 ? "star" : "stars"}`;
  return `  ${rank}. ${repo.name} (${stars}, ${orDash(repo.language)})\n     ${orDash(repo.description)}`;
}

export function formatProfile({ user, repos }: Profile, limit: number): string {
  const rows: [string, string][] = [
    ["Name", orDash(user.name)],
    ["Login", user.login],
    ["Location", orDash(user.location)],
    ["Bio", orDash(user.bio)],
    ["Followers", formatCount(user.followers)],
    ["Following", formatCount(user.following)],
    ["Public repos", formatCount(user.publicRepos)],
    ["Joined", formatDate(user.createdAt)],
  ];
  const width = Math.max(...rows.map(([label]) => label.length)) + 2;
  const lines = rows.map(([label, value]) => `${`${label}:`.padEnd(width)}${value}`);
  const top = topRepos(repos, limit);
  lines.push("");
  if (top.length === 0) {
    lines.push("No public repositories.");
  } else {
    lines.push(top.length === 1 ? "Top repository by stars:" : `Top ${top.length} repositories by stars:`);
    top.forEach((repo, index) => lines.push(formatRepo(repo, index + 1)));
  }
  return lines.join("\n");
}
