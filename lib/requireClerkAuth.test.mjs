import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { createRequireClerkAuth } from "./requireClerkAuth.mjs";

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

let originalSecret;

beforeEach(() => {
  originalSecret = process.env.CLERK_SECRET_KEY;
  process.env.CLERK_SECRET_KEY = "test_secret";
});

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.CLERK_SECRET_KEY;
  } else {
    process.env.CLERK_SECRET_KEY = originalSecret;
  }
});

test("401 when Authorization header is missing", async () => {
  const mw = createRequireClerkAuth(async () => ({ sub: "user_1" }));
  const req = { headers: {} };
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Unauthorized" });
  assert.equal(nextCalled, false);
});

test("401 when Authorization is not Bearer", async () => {
  const mw = createRequireClerkAuth(async () => ({ sub: "user_1" }));
  const req = { headers: { authorization: "Basic abc" } };
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("500 when CLERK_SECRET_KEY is missing", async () => {
  delete process.env.CLERK_SECRET_KEY;
  const mw = createRequireClerkAuth(async () => ({ sub: "user_1" }));
  const req = { headers: { authorization: "Bearer tok" } };
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server misconfigured" });
  assert.equal(nextCalled, false);
});

test("401 when verify throws", async () => {
  const mw = createRequireClerkAuth(async () => {
    throw new Error("bad token");
  });
  const req = { headers: { authorization: "Bearer tok" } };
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Unauthorized" });
  assert.equal(nextCalled, false);
});

test("sets req.clerkID and calls next when verify succeeds", async () => {
  const mw = createRequireClerkAuth(async (token) => {
    assert.equal(token, "tok");
    return { sub: "user_abc" };
  });
  const req = { headers: { authorization: "Bearer tok" } };
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });
  assert.equal(req.clerkID, "user_abc");
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});
