import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const api = "https://chromewebstore.googleapis.com";
export async function publishStore({
  env = process.env,
  fetcher = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log,
  read = readFile,
} = {}) {
  const required = [
    "CWS_PUBLISHER_ID",
    "CWS_EXTENSION_ID",
    "CWS_CLIENT_ID",
    "CWS_CLIENT_SECRET",
    "CWS_REFRESH_TOKEN",
    "RELEASE_VERSION",
    "RELEASE_MODE",
  ];
  for (const name of required)
    assert(env[name], `Missing ${name}; configure the chrome-web-store environment`);
  assert.equal(env.GITHUB_REF, "refs/heads/main", "Store releases must run from main");
  assert.match(env.CWS_PUBLISHER_ID, /^[\w-]+$/);
  assert.match(env.CWS_EXTENSION_ID, /^[a-p]{32}$/);
  assert(["upload", "submit"].includes(env.RELEASE_MODE), "Choose upload or submit");
  const meta = JSON.parse(await read("release/release.json", "utf8"));
  assert.equal(
    meta.version,
    env.RELEASE_VERSION,
    "Requested version must match the tested artifact",
  );
  assert.match(meta.file, /^flow-\d+(?:\.\d+){0,3}\.zip$/);
  assert.equal(
    meta.commit,
    env.GITHUB_SHA,
    "Artifact must come from this workflow commit",
  );
  const zip = await read(resolve("release", meta.file));
  assert.equal(
    createHash("sha256").update(zip).digest("hex"),
    meta.sha256,
    "Artifact checksum mismatch",
  );
  async function json(url, options) {
    const response = await fetcher(url, {
      ...options,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok)
      throw new Error(
        `Chrome Web Store request failed (HTTP ${response.status}); inspect the Developer Dashboard. Response bodies are suppressed to protect credentials.`,
      );
    return response.json();
  }
  const token = await json("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.CWS_CLIENT_ID,
      client_secret: env.CWS_CLIENT_SECRET,
      refresh_token: env.CWS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  assert(
    typeof token.access_token === "string" && token.access_token,
    "OAuth did not return an access token",
  );
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const name = `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_EXTENSION_ID}`;
  let upload = await json(`${api}/upload/v2/${name}:upload`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/zip" },
    body: zip,
  });
  let state = upload.uploadState;
  for (
    let attempt = 0;
    ["IN_PROGRESS", "UPLOAD_IN_PROGRESS"].includes(state) && attempt < 24;
    attempt++
  ) {
    await sleep(5000);
    const status = await json(`${api}/v2/${name}:fetchStatus`, { headers });
    state = status.lastAsyncUploadState;
  }
  assert(
    ["SUCCEEDED", "SUCCESS"].includes(state),
    "Upload failed or timed out; no publish request was sent",
  );
  if (upload.crxVersion)
    assert.equal(upload.crxVersion, meta.version, "Store upload version mismatch");
  log(`Uploaded Flow ${meta.version}.`);
  if (env.RELEASE_MODE === "submit") {
    const submission = await json(`${api}/v2/${name}:publish`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        publishType: "DEFAULT_PUBLISH",
        skipReview: false,
        blockOnWarnings: true,
      }),
    });
    assert(submission.state, "Store did not return a submission state");
    log(
      `Submitted Flow ${meta.version} for review. Store state: ${submission.state}. Approval is not guaranteed by this workflow.`,
    );
  } else log("Draft upload only. Nothing was submitted for publication.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await publishStore();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
