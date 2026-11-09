import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { zipSync, unzipSync } from "fflate";
import { verifyExtension } from "./verify-extension.mjs";
import assert from "node:assert/strict";

await mkdir("release", { recursive: true });
if (process.argv[2] === "unpack") {
  const metadata = JSON.parse(await readFile("release/release.json", "utf8"));
  assert.match(metadata.file, /^flow-\d+(?:\.\d+){0,3}\.zip$/);
  const zip = await readFile(resolve("release", metadata.file));
  assert.equal(createHash("sha256").update(zip).digest("hex"), metadata.sha256);
  const entries = unzipSync(zip);
  for (const [name, bytes] of Object.entries(entries)) {
    assert(
      !name.startsWith("/") &&
        !name.includes(":") &&
        !name.includes("\\") &&
        !name.split("/").includes(".."),
      "Unsafe archive path",
    );
    const path = resolve("dist", name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
  await verifyExtension();
  console.log(`Unpacked the verified CI artifact ${metadata.file}`);
} else {
  const { manifest, files, root } = await verifyExtension();
  const entries = {};
  for (const file of files)
    entries[file] = [
      await readFile(resolve(root, file)),
      { mtime: new Date("1980-01-01T00:00:00Z") },
    ];
  const zip = zipSync(entries, { level: 6 });
  const file = `flow-${manifest.version}.zip`,
    sha256 = createHash("sha256").update(zip).digest("hex");
  await writeFile(resolve("release", file), zip);
  await writeFile(resolve("release", file + ".sha256"), `${sha256}  ${file}\n`);
  await writeFile(
    "release/release.json",
    JSON.stringify(
      { file, version: manifest.version, sha256, commit: process.env.GITHUB_SHA ?? null },
      null,
      2,
    ) + "\n",
  );
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `version=${manifest.version}\n`);
  console.log(`Packaged ${file} (${zip.length} bytes), SHA-256 ${sha256}`);
}
