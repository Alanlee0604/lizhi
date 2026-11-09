import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStopAt, shouldStop } from "../lib/stop-at";

describe("CF worker STOP_AT", () => {
  it("requires a parseable timestamp and stops at or after it", () => {
    const stop = parseStopAt("2026-11-09T21:00:00+08:00");
    assert.ok(stop);
    assert.equal(shouldStop(stop, stop - 1), false);
    assert.equal(shouldStop(stop, stop), true);
    assert.equal(parseStopAt(""), null);
    assert.equal(parseStopAt("not-a-date"), null);
  });
});
