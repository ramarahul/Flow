import assert from "node:assert/strict";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { automaticReleaseNotes } from "./release-notes.mjs";

export function versionParts(value) {
  assert(
    typeof value === "string" &&
      value === value.trim() &&
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value),
    "Use a numeric major.minor.patch version, such as 1.0.1",
  );
  const parts = value.split(".").map(Number);
  assert(
    parts.every((part) => part <= 65535) && parts.some(Boolean),
    "Chrome version components must be 0–65535 and the version must be greater than zero",
  );
  return parts;
}
export function compareVersions(left, right) {
  const a = versionParts(left),
    b = versionParts(right);
  for (let index = 0; index < 3; index++)
    if (a[index] !== b[index]) return Math.sign(a[index] - b[index]);
  return 0;
}
export async function prepareVersion(
  change,
  root = process.cwd(),
  summary = "",
  autoNotes = false,
) {
  assert(
    typeof summary === "string" && summary.length <= 10000,
    "Release summary must be text, at most 10000 characters",
  );
  const paths = [
    "package.json",
    "package-lock.json",
    "public/manifest.json",
    "CHANGELOG.md",
  ];
  const contents = await Promise.all(
    paths.map((path) => readFile(resolve(root, path), "utf8")),
  );
  const [pkg, lock, manifest] = contents.slice(0, 3).map((value) => JSON.parse(value));
  assert.equal(
    lock.version,
    pkg.version,
    "Versions must match before preparing a release",
  );
  assert.equal(lock.packages[""].version, pkg.version);
  assert.equal(manifest.version, pkg.version);
  const parts = versionParts(pkg.version);
  const index = ["major", "minor", "patch"].indexOf(change);
  let next = change;
  if (index >= 0) {
    parts[index]++;
    for (let cursor = index + 1; cursor < 3; cursor++) parts[cursor] = 0;
    next = parts.join(".");
  }
  assert(
    compareVersions(next, pkg.version) > 0,
    "The new version must be higher than the current version",
  );
  const match = /(^## \[Unreleased\][^\n]*\n)([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(
    contents[3],
  );
  assert(match, "CHANGELOG.md must contain ## [Unreleased]");
  const notes =
    [
      summary.trim() ? `- ${summary.trim().replace(/\r?\n/g, "\n  ")}` : "",
      match[2].trim(),
    ]
      .filter(Boolean)
      .join("\n\n") || (autoNotes ? automaticReleaseNotes(root, pkg.version) : "");
  assert(
    notes,
    "Enter a release summary in the GitHub form or add release notes below ## [Unreleased] in CHANGELOG.md",
  );
  assert(!contents[3].includes(`## [${next}]`), "This changelog version already exists");
  pkg.version = lock.version = lock.packages[""].version = manifest.version = next;
  const changelog = contents[3].replace(
    match[0],
    `${match[1]}\n## [${next}]\n\n${notes}\n\n`,
  );
  const updated = [pkg, lock, manifest].map(
    (value) => JSON.stringify(value, null, 2) + "\n",
  );
  updated.push(changelog);
  for (let cursor = 0; cursor < paths.length; cursor++)
    await writeFile(resolve(root, paths[cursor]), updated[cursor]);
  return next;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assert(
      process.argv.length === 3,
      "Usage: npm run release:prepare -- patch|minor|major|1.2.3",
    );
    const version = await prepareVersion(
      process.argv[2],
      process.cwd(),
      process.env.RELEASE_NOTES ?? "",
      process.env.RELEASE_AUTO_NOTES === "true",
    );
    if (process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT, `version=${version}\n`);
    console.log(
      `Prepared ${version}. Review the version files and changelog, run npm run format, and open a PR. No commit, tag, upload, or publication was performed.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
