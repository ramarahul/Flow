import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { prepareVersion, compareVersions } from "../../scripts/release-version.mjs";
import { releasePlan } from "../../scripts/release-plan.mjs";
import { automaticReleaseNotes, notesFromCommits } from "../../scripts/release-notes.mjs";

it("generates release notes from merge titles and commits without treating text as commands", () => {
  assert.equal(
    notesFromCommits([
      "Merge pull request #12 from owner/feature\n\nImprove task selection",
      "Fix timer recovery (#13)",
      "Fix timer recovery (#13)",
      "$(do-not-execute)\n## not a changelog heading",
    ]),
    "- Improve task selection\n- Fix timer recovery (#13)\n- $(do-not-execute)",
  );
  assert.match(notesFromCommits([]), /No new commits/);
});

it("finds the version boundary despite later package edits and prepares a release without manual notes", async () => {
  const root = await mkdtemp(join(tmpdir(), "flow-release-test-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
  const commit = (title) => {
    git("add", ".");
    git(
      "-c",
      "user.name=Release test",
      "-c",
      "user.email=release@example.invalid",
      "commit",
      "-m",
      title,
    );
  };
  try {
    git("init");
    await mkdir(join(root, "public"));
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "1.0.0" }));
    commit("Initial release");
    await writeFile(join(root, "earlier.txt"), "earlier feature");
    commit("Already released feature");
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "1.1.0" }));
    commit("Prepare Flow 1.1.0");
    assert.match(automaticReleaseNotes(root, "1.1.0"), /No new commits/);
    await writeFile(join(root, "feature.txt"), "new feature");
    commit("Improve task selection (#12)");
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ version: "1.1.0", scripts: { build: "vite build" } }),
    );
    commit("Improve build tooling (#13)");
    assert.equal(
      automaticReleaseNotes(root, "1.1.0"),
      "- Improve build tooling (#13)\n- Improve task selection (#12)",
    );
    await writeFile(
      join(root, "package-lock.json"),
      JSON.stringify({ version: "1.1.0", packages: { "": { version: "1.1.0" } } }),
    );
    await writeFile(
      join(root, "public/manifest.json"),
      JSON.stringify({ version: "1.1.0" }),
    );
    await writeFile(
      join(root, "CHANGELOG.md"),
      "# Changelog\n\n## [Unreleased]\n\n## [1.1.0]\n\n- Earlier release.\n",
    );
    assert.equal(await prepareVersion("minor", root, "", true), "1.2.0");
    const notes = await readFile(join(root, "CHANGELOG.md"), "utf8");
    assert.match(notes, /## \[1.2.0\]/);
    assert.match(notes, /Improve task selection/);
    assert(!notes.includes("Already released feature"));
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert(basename(root).startsWith("flow-release-test-"));
    await rm(root, { recursive: true, force: true });
  }
});

it("only submits automatic releases for an opted-in version increase on main", () => {
  const base = {
    event: "push",
    ref: "refs/heads/main",
    current: "1.1.0",
    previous: "1.0.0",
    automatic: "true",
  };
  assert.deepEqual(releasePlan(base), {
    release: true,
    version: "1.1.0",
    mode: "submit",
  });
  assert.equal(releasePlan({ ...base, automatic: "false" }).release, false);
  assert.equal(releasePlan({ ...base, previous: "1.1.0" }).release, false);
  assert.equal(releasePlan({ ...base, previous: undefined }).release, false);
  assert.throws(() => releasePlan({ ...base, ref: "refs/heads/feature" }));
  assert.throws(() => releasePlan({ ...base, previous: "2.0.0" }));
  assert.throws(() => releasePlan({ ...base, event: "pull_request" }));
});
it("allows a manually requested draft without enabling automatic releases", () => {
  const base = {
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    current: "1.0.0",
    requested: "1.0.0",
    mode: "upload",
  };
  assert.equal(releasePlan(base).mode, "upload");
  assert.equal(releasePlan({ ...base, mode: "check" }).mode, "check");
  assert.throws(() => releasePlan({ ...base, requested: "1.0.1" }));
  assert.throws(() => releasePlan({ ...base, mode: "unknown" }));
});
it("compares numeric versions and rejects unsupported Chrome version formats", () => {
  assert(compareVersions("1.10.0", "1.9.9") > 0);
  for (const value of ["1.0.0-beta", "v1.0.0", "01.0.0", "65536.0.0", "0.0.0", "1.0.0\n"])
    assert.throws(() => compareVersions(value, "1.0.0"));
});
it("prepares all version files and notes together, without modifying files on validation failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "flow-release-test-"));
  try {
    await mkdir(join(root, "public"));
    const fixtures = {
      "package.json": { name: "flow", version: "1.0.0" },
      "package-lock.json": { version: "1.0.0", packages: { "": { version: "1.0.0" } } },
      "public/manifest.json": { manifest_version: 3, version: "1.0.0" },
    };
    for (const [file, value] of Object.entries(fixtures))
      await writeFile(join(root, file), JSON.stringify(value));
    await writeFile(
      join(root, "CHANGELOG.md"),
      "# Changelog\n\n## [Unreleased]\n\n- Fix timer recovery.\n\n## [1.0.0]\n\n- Initial version.\n",
    );
    assert.equal(await prepareVersion("patch", root), "1.0.1");
    for (const file of Object.keys(fixtures))
      assert.equal(JSON.parse(await readFile(join(root, file), "utf8")).version, "1.0.1");
    assert.equal(
      JSON.parse(await readFile(join(root, "package-lock.json"), "utf8")).packages[""]
        .version,
      "1.0.1",
    );
    const notes = await readFile(join(root, "CHANGELOG.md"), "utf8");
    assert.match(notes, /## \[1.0.1\]\n\n- Fix timer recovery/);
    await assert.rejects(prepareVersion("minor", root), /release notes/);
    await assert.rejects(prepareVersion("1.0.0", root), /higher/);
    assert.equal(await readFile(join(root, "CHANGELOG.md"), "utf8"), notes);
    assert.equal(
      JSON.parse(await readFile(join(root, "package.json"), "utf8")).version,
      "1.0.1",
    );
    assert.equal(
      await prepareVersion(
        "minor",
        root,
        "Add hourly statistics.\n## Not a version heading",
      ),
      "1.1.0",
    );
    const featureNotes = await readFile(join(root, "CHANGELOG.md"), "utf8");
    assert.match(
      featureNotes,
      /## \[1.1.0\]\n\n- Add hourly statistics\.\n  ## Not a version heading/,
    );
    assert(!featureNotes.includes("\n## Not a version heading"));
    await assert.rejects(
      prepareVersion("patch", root, "x".repeat(10001)),
      /Release summary/,
    );
    assert.equal(await readFile(join(root, "CHANGELOG.md"), "utf8"), featureNotes);
    const output = join(root, "github-output");
    execFileSync(process.execPath, [resolve("scripts/release-version.mjs"), "patch"], {
      cwd: root,
      env: {
        ...process.env,
        RELEASE_NOTES: "Fix website scrolling.",
        GITHUB_OUTPUT: output,
      },
      stdio: "pipe",
    });
    assert.equal(await readFile(output, "utf8"), "version=1.1.1\n");
    assert.equal(
      JSON.parse(await readFile(join(root, "public/manifest.json"), "utf8")).version,
      "1.1.1",
    );
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert(basename(root).startsWith("flow-release-test-"));
    await rm(root, { recursive: true, force: true });
  }
});
