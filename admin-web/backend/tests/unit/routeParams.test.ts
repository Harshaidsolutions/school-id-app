import { test } from "node:test";
import assert from "node:assert/strict";
import { routeParam } from "../../src/utils/routeParams.ts";

test("routeParam: trims a string", () => assert.equal(routeParam("  abc  "), "abc"));
test("routeParam: first element of an array, trimmed", () => assert.equal(routeParam(["  x ", "y"]), "x"));
test("routeParam: empty array => empty string", () => assert.equal(routeParam([]), ""));
test("routeParam: undefined => empty string", () => assert.equal(routeParam(undefined), ""));
