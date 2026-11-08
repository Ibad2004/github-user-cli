import { AppError } from "./github.js";

export interface User {
  login: string;
  name: string | null;
  location: string | null;
  bio: string | null;
  followers: number;
  following: number;
  publicRepos: number;
  createdAt: string;
}

export interface Repo {
  name: string;
  stars: number;
  language: string | null;
  description: string | null;
}

export interface Profile {
  user: User;
  repos: Repo[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

const invalid = (what: string): AppError => new AppError(`Unexpected response from GitHub: ${what}`);

export function parseUser(data: unknown): User {
  if (!isRecord(data)) throw invalid("user is not an object");
  const { login, followers, following, public_repos: publicRepos, created_at: createdAt } = data;
  if (typeof login !== "string" || login === "") throw invalid("user has no login");
  if (!isCount(followers) || !isCount(following) || !isCount(publicRepos)) {
    throw invalid("user counts are missing");
  }
  if (typeof createdAt !== "string") throw invalid("user has no created_at");
  return {
    login,
    name: textOrNull(data.name),
    location: textOrNull(data.location),
    bio: textOrNull(data.bio),
    followers,
    following,
    publicRepos,
    createdAt,
  };
}

export function parseRepo(data: unknown, index: number): Repo {
  if (!isRecord(data)) throw invalid(`repo #${index + 1} is not an object`);
  const { name, stargazers_count: stars } = data;
  if (typeof name !== "string" || name === "") throw invalid(`repo #${index + 1} has no name`);
  if (!isCount(stars)) throw invalid(`repo ${name} has no star count`);
  return { name, stars, language: textOrNull(data.language), description: textOrNull(data.description) };
}

export function parseRepos(data: unknown): Repo[] {
  if (!Array.isArray(data)) throw invalid("repos is not a list");
  const items: unknown[] = data;
  return items.map((item, index) => parseRepo(item, index));
}

export function parseProfile(data: unknown): Profile {
  if (!isRecord(data)) throw invalid("profile is not an object");
  return { user: parseUser(data.user), repos: parseRepos(data.repos) };
}
