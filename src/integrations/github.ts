import { Octokit } from "@octokit/rest";
import { config } from "../config/index.js";
import type { PRDiffInput, PRFileDiff, FormattedComment } from "../types/index.js";

let octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!octokit) {
    if (!config.github.token) {
      throw new Error(
        "GitHub token not configured. Set GITHUB_TOKEN environment variable."
      );
    }
    octokit = new Octokit({ auth: config.github.token });
  }
  return octokit;
}

export async function fetchPRDiff(
  repoFullName: string,
  prNumber: number
): Promise<PRDiffInput> {
  const [owner, repo] = repoFullName.split("/");
  const client = getOctokit();

  // Get PR details
  const { data: pr } = await client.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  // Get PR files
  const { data: files } = await client.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  const prFiles: PRFileDiff[] = files.map((file) => ({
    path: file.filename,
    diff: file.patch || "",
    status: mapFileStatus(file.status),
    additions: file.additions,
    deletions: file.deletions,
  }));

  return {
    prNumber,
    title: pr.title,
    files: prFiles,
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
  };
}

function mapFileStatus(
  status: string
): "added" | "modified" | "deleted" | "renamed" {
  switch (status) {
    case "added":
      return "added";
    case "removed":
      return "deleted";
    case "renamed":
      return "renamed";
    default:
      return "modified";
  }
}

export async function postPRComments(
  repoFullName: string,
  prNumber: number,
  commitSha: string,
  comments: FormattedComment[]
): Promise<void> {
  const [owner, repo] = repoFullName.split("/");
  const client = getOctokit();

  for (const comment of comments) {
    try {
      await client.pulls.createReviewComment({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: commitSha,
        path: comment.file,
        line: comment.line,
        body: comment.body,
      });
    } catch (error) {
      console.error(`Failed to post comment on ${comment.file}:${comment.line}`, error);
    }
  }
}

export async function postPRReview(
  repoFullName: string,
  prNumber: number,
  summary: string,
  comments: FormattedComment[]
): Promise<void> {
  const [owner, repo] = repoFullName.split("/");
  const client = getOctokit();

  // Get the latest commit
  const { data: pr } = await client.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const hasErrors = comments.some((c) => c.severity === "error");
  const event = hasErrors ? "REQUEST_CHANGES" : "COMMENT";

  const reviewComments = comments.map((c) => ({
    path: c.file,
    line: c.line,
    body: c.body,
  }));

  await client.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: pr.head.sha,
    body: summary,
    event,
    comments: reviewComments,
  });
}

export async function getPRComments(
  repoFullName: string,
  prNumber: number
): Promise<Array<{ body: string; path?: string; line?: number }>> {
  const [owner, repo] = repoFullName.split("/");
  const client = getOctokit();

  const { data: comments } = await client.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  return comments.map((c) => ({
    body: c.body,
    path: c.path,
    line: c.line || c.original_line,
  }));
}

export async function getRepoContents(
  repoFullName: string,
  filePath: string,
  ref?: string
): Promise<string> {
  const [owner, repo] = repoFullName.split("/");
  const client = getOctokit();

  const { data } = await client.repos.getContent({
    owner,
    repo,
    path: filePath,
    ref,
  });

  if ("content" in data && data.content) {
    return Buffer.from(data.content, "base64").toString("utf-8");
  }

  throw new Error(`Could not get content for ${filePath}`);
}

// Webhook payload types
export interface PRWebhookPayload {
  action: "opened" | "synchronize" | "reopened" | "closed";
  number: number;
  pull_request: {
    title: string;
    head: { sha: string; ref: string };
    base: { ref: string };
  };
  repository: {
    full_name: string;
  };
}

export function isPRWebhookPayload(payload: unknown): payload is PRWebhookPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "action" in payload &&
    "number" in payload &&
    "pull_request" in payload &&
    "repository" in payload
  );
}
