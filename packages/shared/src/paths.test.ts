import { test, expect } from "bun:test";
import { normSeg, pathParts, isSafeRelPath } from "./paths";

test("normSeg lowercases and NFC-normalizes", () => {
  expect(normSeg("Ubuzama")).toBe("ubuzama");
  expect(normSeg("Cafe\u0301")).toBe(normSeg("Café")); // combining → composed
});

test("pathParts splits nested paths", () => {
  expect(pathParts("ubuzama/ub02/clip.mp4")).toEqual({
    dir: "ubuzama/ub02",
    name: "clip.mp4",
    top: "ubuzama",
  });
  expect(pathParts("loose.mp4")).toEqual({ dir: "", name: "loose.mp4", top: "" });
});

test("isSafeRelPath rejects escapes and empties", () => {
  expect(isSafeRelPath("a/b.mp4")).toBe(true);
  expect(isSafeRelPath("")).toBe(false);
  expect(isSafeRelPath("/abs.mp4")).toBe(false);
  expect(isSafeRelPath("../escape.mp4")).toBe(false);
  expect(isSafeRelPath("a//b.mp4")).toBe(false);
});
