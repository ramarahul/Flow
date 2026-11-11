import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { approvedRuleset } from "./github-ruleset.mjs";

const ruleset = approvedRuleset(
  JSON.parse(
    await readFile(new URL("../.github/main-ruleset.json", import.meta.url), "utf8"),
  ),
);
const explicit = process.argv.indexOf("--repo");
const remote =
  process.env.GITHUB_REPOSITORY ??
  execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" })
    .trim()
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/\.git$/, "");
const repo = explicit >= 0 ? process.argv[explicit + 1] : remote;
assert.match(repo, /^[\w.-]+\/[\w.-]+$/, "Use --repo owner/repository");
if (!process.argv.includes("--apply")) {
  console.log(
    `Preview only: ${repo}. Require PR gate on main, prevent deletion/force-push, and create a main-only chrome-web-store environment with owner approval. Run again with --apply and a repository-scoped administration-write token to apply.`,
  );
  console.log(JSON.stringify(ruleset, null, 2));
} else {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  assert(
    token,
    "Set GH_TOKEN to a fine-grained token for this repository with Administration: write. Do not commit the token.",
  );
  async function api(path, method = "GET", body, allowMissing = false) {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 404 && allowMissing) return null;
    assert(
      response.ok,
      `GitHub ${method} ${path} failed (HTTP ${response.status}). Check repository admin access and plan support; no protections were silently disabled.`,
    );
    return response.status === 204 ? null : response.json();
  }
  const app = await api("/apps/github-actions");
  assert.equal(app.id, 15368, "Unexpected GitHub Actions application ID");
  const existing = await api(`/repos/${repo}/rulesets?per_page=100`);
  const rule = existing.find((item) => item.name === ruleset.name);
  await api(
    `/repos/${repo}/rulesets${rule ? `/${rule.id}` : ""}`,
    rule ? "PUT" : "POST",
    ruleset,
  );
  const path = `/repos/${repo}/environments/chrome-web-store`;
  const current = await api(path, "GET", undefined, true);
  if (current?.deployment_branch_policy?.protected_branches)
    throw new Error(
      "The existing environment uses protected-branch deployment rules. Review it manually before changing to main-only selected branches. Main PR rules are already configured.",
    );
  const owner = await api(`/users/${repo.split("/")[0]}`);
  assert.equal(
    owner.type,
    "User",
    "For an organization repository, configure the production reviewer team manually. Main PR rules are already configured.",
  );
  const oldReview = current?.protection_rules?.find(
    (rule) => rule.type === "required_reviewers",
  );
  const reviewers =
    oldReview?.reviewers?.map((entry) => ({ type: entry.type, id: entry.reviewer.id })) ??
    [];
  if (!reviewers.length) reviewers.push({ type: "User", id: owner.id });
  await api(path, "PUT", {
    reviewers,
    prevent_self_review: oldReview?.prevent_self_review ?? false,
    can_admins_bypass: false,
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  });
  const policies = await api(`${path}/deployment-branch-policies`);
  if (
    policies.branch_policies.some((item) => item.name !== "main" || item.type === "tag")
  )
    throw new Error(
      "Existing production deployment policies include other refs. Review them manually; existing policies were not deleted.",
    );
  if (!policies.branch_policies.some((item) => item.name === "main"))
    await api(`${path}/deployment-branch-policies`, "POST", {
      name: "main",
      type: "branch",
    });
  console.log(
    `Configured ${repo}: main PR checks and chrome-web-store approval environment. Configure publishing variables as described in .github/RELEASING.md. No code was pushed or published.`,
  );
}
