import { it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { publishStore } from "../../scripts/publish-store.mjs";

const zip = Buffer.from("verified test package");
const env = {
  CWS_PUBLISHER_ID: "publisher-1",
  CWS_EXTENSION_ID: "a".repeat(32),
  CWS_ACCESS_TOKEN: "temporary-google-access-token",
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
    { body: {} },
    { body: { uploadState: "SUCCEEDED", crxVersion: "1.0.0" } },
  ]);
  const logs = [];
  await publishStore({ env, read, fetcher: t.fetcher, log: (value) => logs.push(value) });
  assert.equal(t.requests.length, 2);
  assert.equal(
    t.requests[0].url,
    `https://chromewebstore.googleapis.com/v2/publishers/publisher-1/items/${"a".repeat(32)}:fetchStatus`,
  );
  assert.equal(t.requests[0].options.body, undefined);
  assert.equal(
    t.requests[1].url,
    `https://chromewebstore.googleapis.com/upload/v2/publishers/publisher-1/items/${"a".repeat(32)}:upload`,
  );
  assert.equal(t.requests[1].options.method, "POST");
  assert.equal(t.requests[1].options.headers["Content-Type"], "application/zip");
  assert.equal(t.requests[1].options.body, zip);
  for (const request of t.requests) {
    assert.equal(request.options.headers.Authorization, `Bearer ${env.CWS_ACCESS_TOKEN}`);
    assert.equal(request.options.redirect, "error");
  }
  assert(!logs.join().includes("secret"));
  assert(!logs.join().includes("token"));
});
it("waits for asynchronous upload, then submits with review and warning checks", async () => {
  const t = transport([
    { body: {} },
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
  assert.equal(
    t.requests[3].url,
    `https://chromewebstore.googleapis.com/v2/publishers/publisher-1/items/${"a".repeat(32)}:publish`,
  );
  assert.equal(t.requests[3].options.method, "POST");
  assert.equal(t.requests[3].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(t.requests[3].options.body), {
    publishType: "DEFAULT_PUBLISH",
    skipReview: false,
    blockOnWarnings: true,
  });
});
it("fails closed on upload error, wrong ref, version, or checksum without submitting", async () => {
  const t = transport([{ body: {} }, { body: { uploadState: "FAILED" } }]);
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

it("refuses to overwrite an active review, staged item, or already-published version", async () => {
  for (const status of [
    { submittedItemRevisionStatus: { state: "PENDING_REVIEW" } },
    { submittedItemRevisionStatus: { state: "STAGED" } },
    { submittedItemRevisionStatus: { state: "UNEXPECTED_STATE" } },
    { publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: "1.0.0" }] } },
    { publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: "2.0.0" }] } },
  ]) {
    const t = transport([{ body: status }]);
    await assert.rejects(publishStore({ env, read, fetcher: t.fetcher, log: () => {} }));
    assert.equal(t.requests.length, 1);
    assert(!t.requests.some((request) => request.url.endsWith(":upload")));
  }
});

it("checks V2 access without uploading, even for an already-published version", async () => {
  const t = transport([
    {
      body: {
        publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: "1.0.0" }] },
      },
    },
  ]);
  await publishStore({
    env: { ...env, RELEASE_MODE: "check" },
    read,
    fetcher: t.fetcher,
    log: () => {},
  });
  assert.equal(t.requests.length, 1);
  assert(
    t.requests.every(
      (request) =>
        request.url.endsWith(":fetchStatus") &&
        !request.options.method &&
        !request.options.body,
    ),
  );
});

it("requires a temporary access token without falling back to legacy secrets", async () => {
  for (const token of [undefined, "", "bad\r\ntoken"]) {
    await assert.rejects(
      publishStore({
        env: {
          ...env,
          CWS_ACCESS_TOKEN: token,
          CWS_CLIENT_ID: "legacy",
          CWS_CLIENT_SECRET: "legacy",
          CWS_REFRESH_TOKEN: "legacy",
        },
        read,
        fetcher: () => {
          throw new Error("Must not access network");
        },
      }),
      /Missing CWS_ACCESS_TOKEN|Invalid temporary access token/,
    );
  }
});

it("fails closed on expired credentials, unknown upload states and HTTP error bodies", async () => {
  const t = transport([
    { ok: false, status: 401, body: { error: env.CWS_ACCESS_TOKEN } },
  ]);
  await assert.rejects(publishStore({ env, read, fetcher: t.fetcher }), (error) => {
    assert.match(error.message, /HTTP 401/);
    assert(!error.message.includes(env.CWS_ACCESS_TOKEN));
    return true;
  });
  assert.equal(t.requests.length, 1);
  for (const state of [
    "SUCCESS",
    "UPLOAD_STATE_UNSPECIFIED",
    "NOT_FOUND",
    "unexpected",
  ]) {
    const failed = transport([{ body: {} }, { body: { uploadState: state } }]);
    await assert.rejects(
      publishStore({
        env: { ...env, RELEASE_MODE: "submit" },
        read,
        fetcher: failed.fetcher,
        log: () => {},
      }),
      /Upload failed/,
    );
    assert.equal(failed.requests.length, 2);
  }
});
