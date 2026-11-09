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
  assert.deepEqual(ci.jobs.gate.needs, ["quality", "build", "e2e"]);
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
it("keeps publishing manual, main-only, environment-gated, and separate from package installs", async () => {
  const workflow = parse(await readFile(".github/workflows/publish.yml", "utf8"));
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.on.workflow_dispatch.inputs.mode.default, "upload");
  assert.match(workflow.jobs.publish.if, /refs\/heads\/main/);
  assert.equal(workflow.jobs.publish.environment, "chrome-web-store");
  assert.equal(workflow.jobs.publish.needs, "verify");
  assert.equal(workflow.jobs.verify.uses, "./.github/workflows/ci.yml");
  for (const step of workflow.jobs.publish.steps) {
    if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
    assert(!/npm (?:ci|install)/.test(step.run ?? ""));
  }
});
