import assert from "node:assert/strict";
import test from "node:test";
import { authDestination } from "../../src/lib/auth-redirect";

test("Auth return destinations reject URL-parser redirect bypasses and preserve safe app paths", () => {
  const origin = "https://archride.example";
  for (const value of [null, "https://other.example", "//other.example", "/\\other.example", "/\t/other.example", "/\n/other.example", "/.//other.example", "/safe/..//other.example", "javascript:alert(1)"]) {
    const destination = authDestination(value, origin);
    assert.equal(destination.origin, origin);
    assert.equal(destination.pathname, "/profile");
  }
  assert.equal(authDestination("/map?stop=uga-passio%3A123#details", origin).href, origin + "/map?stop=uga-passio%3A123#details");
  assert.equal(authDestination("/reset-password", origin).pathname, "/reset-password");
});
