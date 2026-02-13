import test from "node:test";
import assert from "node:assert/strict";
import { parseRangeHeader } from "../src/lib/http-range.js";

test("parseRangeHeader parses a standard start-end range", () => {
  assert.deepEqual(parseRangeHeader("bytes=10-20", 100), { start: 10, end: 20 });
});

test("parseRangeHeader parses open-ended ranges", () => {
  assert.deepEqual(parseRangeHeader("bytes=10-", 100), { start: 10, end: 99 });
});

test("parseRangeHeader parses suffix ranges", () => {
  assert.deepEqual(parseRangeHeader("bytes=-25", 100), { start: 75, end: 99 });
});

test("parseRangeHeader clamps overlarge end values", () => {
  assert.deepEqual(parseRangeHeader("bytes=90-999", 100), { start: 90, end: 99 });
});

test("parseRangeHeader rejects invalid ranges", () => {
  const invalidRanges = [
    "",
    "bytes=",
    "items=0-1",
    "bytes=10-9",
    "bytes=100-200",
    "bytes=-0",
    "bytes=abc-def",
    "bytes=1-2-3",
  ];

  for (const range of invalidRanges) {
    assert.equal(parseRangeHeader(range, 100), null);
  }
});
