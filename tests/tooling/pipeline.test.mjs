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
  assert.equal(release.jobs.publish.permissions, undefined);
  assert.equal(release.jobs.verify.permissions["security-events"], "write");
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
