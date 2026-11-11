import { execFileSync } from "node:child_process";

export function notesFromCommits(messages) {
  const titles = messages
    .map((message) => {
      const lines = message
        .trim()
        .split(/\r?\n/)
        .filter((line) => line.trim());
      const title = /^Merge pull request #\d+ /.test(lines[0] ?? "")
        ? (lines[1] ?? lines[0])
        : lines[0];
      return title
        ?.replace(/[\x00-\x1f\x7f]/g, " ")
        .trim()
        .slice(0, 240);
    })
    .filter(Boolean);
  return (
    [...new Set(titles)].map((title) => `- ${title}`).join("\n") ||
    "- Maintenance release. No new commits since the previous version was prepared."
  );
}

export function automaticReleaseNotes(root, version) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 5_000_000,
    }).trim();
  // Find the actual version boundary, ignoring later edits to package scripts.
  const commits = git("log", "--first-parent", "--format=%H", "--", "package.json").split(
    "\n",
  );
  let baseline;
  for (const commit of commits) {
    const parents = git("rev-list", "--parents", "-n", "1", commit).split(" ");
    if (parents.length === 1) {
      baseline = commit;
      break;
    }
    const previous = JSON.parse(git("show", `${parents[1]}:package.json`));
    if (previous.version !== version) {
      baseline = commit;
      break;
    }
  }
  if (!baseline)
    throw new Error(
      "Cannot find the previous version in Git history. Use a full checkout.",
    );
  const messages = git("log", "--first-parent", "--format=%B%x00", `${baseline}..HEAD`)
    .split("\0")
    .filter((message) => message.trim());
  return notesFromCommits(messages);
}
