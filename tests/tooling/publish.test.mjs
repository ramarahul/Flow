import { it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { publishStore } from "../../scripts/publish-store.mjs";

const zip = Buffer.from("verified test package");
const env = {
  CWS_PUBLISHER_ID: "publisher-1",
  CWS_EXTENSION_ID: "a".repeat(32),
  CWS_CLIENT_ID: "client",
  CWS_CLIENT_SECRET: "secret",
  CWS_REFRESH_TOKEN: "refresh",
  RELEASE_VERSION: "1.0.0",
  RELEASE_MODE: "upload",
  GITHUB_REF: "refs/heads/main",
  GITHUB_SHA: "f".repeat(40),
};
const metadata = {
  file: "flow-1.0.0.zip",
  version: "1.0.0",
  sha256: createHash("sha256").update(zip).digest("hex"),
  commit: env.GITHUB_SHA,
};
const read = async (path) =>
  String(path).endsWith("release.json") ? JSON.stringify(metadata) : zip;
function transport(states) {
  const requests = [];
  return {
    requests,
    fetcher: async (url, options) => {
      requests.push({ url, options });
      const value = states.shift();
      if (!value) throw new Error("Unexpected network request");
      return {
        ok: value.ok ?? true,
        status: value.status ?? 200,
        json: async () => value.body,
      };
    },
  };
}
it("uploads a draft without publishing, and never logs credentials", async () => {
  const t = transport([
    { body: { access_token: "token" } },
    { body: { uploadState: "SUCCEEDED", crxVersion: "1.0.0" } },
  ]);
  const logs = [];
  await publishStore({ env, read, fetcher: t.fetcher, log: (value) => logs.push(value) });
  assert.equal(t.requests.length, 2);
  assert(!logs.join().includes("secret"));
  assert(!logs.join().includes("token"));
});
it("waits for asynchronous upload, then submits with review and warning checks", async () => {
  const t = transport([
    { body: { access_token: "token" } },
    { body: { uploadState: "IN_PROGRESS" } },
    { body: { lastAsyncUploadState: "SUCCEEDED" } },
    { body: { state: "PENDING_REVIEW" } },
  ]);
  await publishStore({
    env: { ...env, RELEASE_MODE: "submit" },
    read,
    fetcher: t.fetcher,
    sleep: async () => {},
    log: () => {},
  });
  assert.match(t.requests[2].url, /:fetchStatus$/);
  assert.deepEqual(JSON.parse(t.requests[3].options.body), {
    publishType: "DEFAULT_PUBLISH",
    skipReview: false,
    blockOnWarnings: true,
  });
});
it("fails closed on upload error, wrong ref, version, or checksum without submitting", async () => {
  const t = transport([
    { body: { access_token: "token" } },
    { body: { uploadState: "FAILED" } },
  ]);
  await assert.rejects(
    publishStore({
      env: { ...env, RELEASE_MODE: "submit" },
      read,
      fetcher: t.fetcher,
      log: () => {},
    }),
  );
  assert.equal(t.requests.length, 2);
  for (const changed of [
    { GITHUB_REF: "refs/heads/feature" },
    { RELEASE_VERSION: "2.0.0" },
    { GITHUB_SHA: "bad" },
  ])
    await assert.rejects(
      publishStore({
        env: { ...env, ...changed },
        read,
        fetcher: () => {
          throw new Error("Must not access network");
        },
      }),
    );
  await assert.rejects(
    publishStore({
      env,
      read: async (path) =>
        String(path).endsWith("release.json")
          ? JSON.stringify({ ...metadata, sha256: "bad" })
          : zip,
      fetcher: () => {
        throw new Error("Must not access network");
      },
    }),
  );
});
