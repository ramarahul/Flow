import { isDeepStrictEqual } from "node:util";

export function approvedRuleset(input) {
  // Only this reviewed payload can cross the local-file/network boundary.
  // Keep the importable GitHub JSON and this policy in sync when changing rules.
  const policy = {
    name: "main requires verified PRs",
    target: "branch",
    enforcement: "active",
    bypass_actors: [],
    conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      {
        type: "pull_request",
        parameters: {
          required_approving_review_count: 0,
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_review_thread_resolution: true,
        },
      },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [{ context: "PR gate", integration_id: 15368 }],
        },
      },
    ],
  };
  if (!isDeepStrictEqual(input, policy))
    throw new Error(
      "The ruleset file does not match the reviewed setup policy. Review changes to .github/main-ruleset.json and scripts/github-ruleset.mjs together before applying. No request was sent.",
    );
  return policy;
}
