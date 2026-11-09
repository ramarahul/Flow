import assert from "node:assert/strict";
import { readFile, appendFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compareVersions, versionParts } from "./release-version.mjs";

export function releasePlan({
  event,
  ref,
  current,
  previous,
  requested,
  mode,
  automatic,
}) {
  assert.equal(ref, "refs/heads/main", "Releases must run from main");
  versionParts(current);
  if (event === "workflow_dispatch") {
    assert.equal(requested, current, "Requested version must match main");
    assert(["upload", "submit"].includes(mode), "Choose upload or submit");
    return { release: true, version: current, mode };
  }
  assert.equal(event, "push", "Unsupported release event");
  if (!previous)
    return {
      release: false,
      reason: "Initial branch push: publish the first version manually",
    };
  const comparison = compareVersions(current, previous);
  assert(comparison >= 0, "Version must not decrease on main");
  if (!comparison) return { release: false, reason: "No version change" };
  if (automatic !== "true")
    return {
      release: false,
      reason:
        "Automatic releases are disabled; configure CWS_AUTO_RELEASE or run manually",
    };
  return { release: true, version: current, mode: "submit" };
}
async function main() {
  const env = process.env;
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  let previous;
  if (env.GITHUB_EVENT_NAME === "push" && event.before && !/^0+$/.test(event.before)) {
    assert.match(event.before, /^[a-f0-9]{40}$/);
    previous = JSON.parse(
      execFileSync("git", ["show", `${event.before}:package.json`], { encoding: "utf8" }),
    ).version;
  }
  const plan = releasePlan({
    event: env.GITHUB_EVENT_NAME,
    ref: env.GITHUB_REF,
    current: pkg.version,
    previous,
    requested: env.REQUESTED_VERSION,
    mode: env.REQUESTED_MODE,
    automatic: env.AUTO_RELEASE,
  });
  if (plan.release) {
    const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
    const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
    assert.equal(manifest.version, plan.version);
    assert.equal(lock.version, plan.version);
    assert.equal(lock.packages[""].version, plan.version);
    const changelog = await readFile("CHANGELOG.md", "utf8");
    const heading = `## [${plan.version}]`;
    const section = changelog.split(heading)[1]?.split(/\n## /)[0]?.trim();
    assert(section, `Add nonempty release notes under ${heading} in CHANGELOG.md`);
  }
  await appendFile(
    env.GITHUB_OUTPUT,
    `release=${plan.release}\nversion=${plan.version ?? ""}\nmode=${plan.mode ?? ""}\n`,
  );
  console.log(plan.release ? `Release ${plan.version}: ${plan.mode}` : plan.reason);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
