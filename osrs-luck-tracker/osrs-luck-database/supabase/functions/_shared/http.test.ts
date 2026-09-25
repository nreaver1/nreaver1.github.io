import { assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAccountHash, isIgn, isInstallToken, isItemId, isKc, tokensMatch } from "./http.ts";

Deno.test("isAccountHash accepts Long.toHexString output only", () => {
  assert(isAccountHash("1a2b3c4d5e6f7a8b"));
  assert(isAccountHash("ff"));
  assertFalse(isAccountHash(""));
  assertFalse(isAccountHash("1a2b3c4d5e6f7a8b9")); // 17 chars
  assertFalse(isAccountHash("xyz"));
  assertFalse(isAccountHash(123));
});

Deno.test("isIgn accepts OSRS names and rejects wildcards", () => {
  assert(isIgn("Zezima"));
  assert(isIgn("Iron Man_1-2"));
  assert(isIgn("Iron Man"));
  assertFalse(isIgn(""));
  assertFalse(isIgn("ThirteenChars"));
  assertFalse(isIgn("%"));
  assertFalse(isIgn("a\b"));
  assertFalse(isIgn(null));
});

Deno.test("isInstallToken requires a uuid", () => {
  assert(isInstallToken("123e4567-e89b-12d3-a456-426614174000"));
  assertFalse(isInstallToken("not-a-token"));
});

Deno.test("numeric validators reject non-integers and out-of-range values", () => {
  assert(isItemId(4151));
  assertFalse(isItemId(0));
  assertFalse(isItemId("4151"));
  assert(isKc(0));
  assertFalse(isKc(-1));
  assertFalse(isKc(1.5));
});

Deno.test("tokensMatch compares exactly", () => {
  assert(tokensMatch("abc", "abc"));
  assertFalse(tokensMatch("abc", "abd"));
  assertFalse(tokensMatch("abc", "abcd"));
  assertFalse(tokensMatch("", "a"));
});
