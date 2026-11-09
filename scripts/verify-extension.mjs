import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve, relative, extname } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

export async function bundleFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const name of await readdir(directory)) {
      const path = resolve(directory, name),
        info = await lstat(path);
      assert(!info.isSymbolicLink(), "Symlinks cannot be packaged");
      if (info.isDirectory()) await visit(path);
      else {
        assert(info.isFile(), "Only regular files can be packaged");
        files.push(relative(root, path).replaceAll("\\", "/"));
      }
    }
  }
  await visit(root);
  return files.sort();
}
export async function verifyExtension(directory = "dist") {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const policy = JSON.parse(await readFile("scripts/extension-policy.json", "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+(?:\.\d+){0,3}$/);
  assert(
    manifest.version
      .split(".")
      .every((part) => Number(part) <= 65535 && String(Number(part)) === part),
  );
  assert(manifest.version.split(".").some((part) => Number(part) > 0));
  assert.equal(manifest.version, pkg.version, "Package and manifest versions must match");
  assert.equal(lock.version, pkg.version, "Lockfile version must match the package");
  assert.equal(
    lock.packages[""].version,
    pkg.version,
    "Lockfile root version must match",
  );
  assert.deepEqual(
    [...manifest.permissions].sort(),
    [...policy.permissions].sort(),
    "Permission changes require updating the reviewed policy",
  );
  assert.deepEqual(manifest.optional_host_permissions, policy.optional_host_permissions);
  assert(!manifest.host_permissions?.length, "Permanent host access is not permitted");
  assert(
    !manifest.optional_permissions?.length,
    "Optional API permissions require review",
  );
  assert(
    !manifest.externally_connectable,
    "External messaging must be explicitly reviewed",
  );
  assert.equal(manifest.content_security_policy.extension_pages, policy.csp);
  assert.equal(manifest.background.type, "module");
  const files = await bundleFiles(root);
  const allowed =
    /^(?:manifest\.json|(?:index|blocked)\.html|(?:popup|blocked|background)\.js|icons\/(?:16|32|48|128)\.png|assets\/[\w.-]+\.(?:js|css|woff2?))$/;
  for (const file of files) {
    assert(allowed.test(file), `Unexpected packaged file: ${file}`);
    const content = await readFile(resolve(root, file));
    if (extname(file) === ".js")
      assert(
        !/\beval\s*\(|\bnew\s+Function\s*\(/.test(content.toString()),
        `Dynamic executable code found in ${file}`,
      );
    if (extname(file) === ".html")
      assert(
        !/<script[^>]+src\s*=\s*["']https?:/i.test(content.toString()),
        `Remote script found in ${file}`,
      );
  }
  for (const entry of [
    manifest.background.service_worker,
    manifest.action.default_popup,
    "blocked.html",
    "popup.js",
    "blocked.js",
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ])
    assert(files.includes(entry), `Missing manifest asset: ${entry}`);
  for (const [size, file] of Object.entries(manifest.icons)) {
    const png = await readFile(resolve(root, file));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), Number(size));
    assert.equal(png.readUInt32BE(20), Number(size));
  }
  return { manifest, files, root };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { manifest, files } = await verifyExtension();
  console.log(
    `Verified MV3 ${manifest.version}: ${files.length} files, reviewed permissions, CSP, and icon sizes.`,
  );
}
