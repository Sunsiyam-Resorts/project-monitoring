import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { randomId } from "../public/ids.js";

test("Record IDs use native UUIDs when available and secure v4 UUIDs otherwise", () => {
  assert.equal(randomId({ randomUUID: () => "native-id" }), "native-id");
  const fallback = { getRandomValues: (bytes) => webcrypto.getRandomValues(bytes) };
  const ids = Array.from({ length: 1000 }, () => randomId(fallback));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.throws(() => randomId({}), /Secure random number generation/);
});
