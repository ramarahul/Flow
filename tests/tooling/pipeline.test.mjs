import { it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";

it("protects PR jobs and gates on every stage, including merge-queue checks", async () => {
  const ci = parse(await readFile(".github/workflows/ci.yml", "utf8"));
  assert.deepEqual(ci.permissions, { contents: "read" });
  assert.deepEqual(ci.on.pull_request.branches, ["main"]);
  assert("merge_group" in ci.on);
  assert(!("pull_request_target" in ci.on));
  assert.deepEqual(ci.jobs.gate.needs, ["quality", "build", "e2e", "security"]);
  assert.match(ci.jobs.gate.if, /always/);
  for (const job of Object.values(ci.jobs))
    for (const step of job.steps ?? []) {
      if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
      assert(!JSON.stringify(step).includes("secrets."));
    }
  const rules = JSON.parse(await readFile(".github/main-ruleset.json", "utf8"));
  assert.equal(rules.enforcement, "active");
  assert.deepEqual(rules.bypass_actors, []);
  assert(rules.rules.some((rule) => rule.type === "pull_request"));
  assert.equal(
    rules.rules.find((rule) => rule.type === "required_status_checks").parameters
      .required_status_checks[0].context,
    "PR gate",
  );
});

it("limits security scanning permissions and keeps publishing credentials isolated", async () => {
  const ci = parse(await readFile(".github/workflows/ci.yml", "utf8"));
  assert.deepEqual(ci.jobs.security.permissions, {
    contents: "read",
    actions: "read",
    "security-events": "write",
  });
  assert(
    ci.jobs.security.steps.some((step) =>
      step.uses?.startsWith("github/codeql-action/analyze@"),
    ),
  );
  assert.equal(
    ci.jobs.security.steps.find((step) =>
      step.uses?.startsWith("github/codeql-action/init@"),
    ).with["build-mode"],
    "none",
  );
  assert.match(ci.jobs.gate.steps[0].run, /test "\$SECURITY" = success/);
  const release = parse(await readFile(".github/workflows/publish.yml", "utf8"));
  assert.deepEqual(release.permissions, { contents: "read" });
  assert.deepEqual(release.jobs.publish.permissions, {
    contents: "read",
    "id-token": "write",
  });
  assert.equal(release.jobs.verify.permissions["security-events"], "write");
});

it("uses scoped OIDC impersonation only after protected release verification", async () => {
  const text = await readFile(".github/workflows/publish.yml", "utf8");
  const workflow = parse(text);
  assert(!text.includes("secrets."));
  assert(
    !/CWS_CLIENT_ID|CWS_CLIENT_SECRET|CWS_REFRESH_TOKEN|pull_request_target/.test(text),
  );
  assert(!("pull_request" in workflow.on));
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.mode.options, [
    "check",
    "upload",
    "submit",
  ]);
  assert.equal(workflow.jobs.publish.outputs, undefined);
  assert.equal(workflow.jobs.plan.permissions?.["id-token"], undefined);
  assert.equal(workflow.jobs.verify.permissions["id-token"], undefined);
  const steps = workflow.jobs.publish.steps;
  const index = steps.findIndex((step) => step.id === "google_auth");
  assert(
    index >
      steps.findIndex((step) => step.uses?.startsWith("actions/download-artifact@")),
  );
  const auth = steps[index];
  assert.equal(
    auth.uses,
    "google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093",
  );
  assert.deepEqual(auth.with, {
    workload_identity_provider: "${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}",
    service_account: "${{ vars.GCP_SERVICE_ACCOUNT }}",
    token_format: "access_token",
    access_token_scopes: "https://www.googleapis.com/auth/chromewebstore",
    access_token_lifetime: "900s",
    create_credentials_file: false,
    export_environment_variables: false,
  });
  assert.equal(
    steps[index + 1].env.CWS_ACCESS_TOKEN,
    "${{ steps.google_auth.outputs.access_token }}",
  );
  assert.equal(steps[index + 1].run, "node scripts/publish-store.mjs");
  for (const [name, job] of Object.entries(workflow.jobs))
    if (name !== "publish") assert(!JSON.stringify(job).includes("google_auth"));
});
it("gates automatic version releases and manual drafts on main, verification, and environment approval", async () => {
  const workflow = parse(await readFile(".github/workflows/publish.yml", "utf8"));
  assert.deepEqual(workflow.on.push.branches, ["main"]);
  assert("workflow_dispatch" in workflow.on);
  assert.equal(workflow.on.workflow_dispatch.inputs.mode.default, "upload");
  assert.match(workflow.jobs.publish.if, /refs\/heads\/main/);
  assert.equal(workflow.jobs.publish.environment, "chrome-web-store");
  assert.deepEqual(workflow.jobs.publish.needs, ["plan", "verify"]);
  assert.equal(workflow.jobs.verify.needs, "plan");
  assert.match(workflow.jobs.verify.if, /needs.plan.outputs.release == 'true'/);
  assert.equal(
    workflow.jobs.plan.steps.find((step) => step.id === "plan").env.AUTO_RELEASE,
    "${{ vars.CWS_AUTO_RELEASE }}",
  );
  assert.equal(workflow.jobs.verify.uses, "./.github/workflows/ci.yml");
  for (const step of workflow.jobs.publish.steps) {
    if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
    assert(!/npm (?:ci|install)/.test(step.run ?? ""));
  }
});

it("pins the runner OS to the Ubuntu release supported by the locked browser tooling", async () => {
  for (const file of ["ci.yml", "publish.yml"]) {
    const workflow = parse(await readFile(`.github/workflows/${file}`, "utf8"));
    for (const job of Object.values(workflow.jobs)) {
      if (job["runs-on"]) assert.equal(job["runs-on"], "ubuntu-24.04");
    }
  }
});
