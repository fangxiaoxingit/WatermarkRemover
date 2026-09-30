import { it, expect } from "vitest";
import { Registry } from "../src/core";
import { ScriptOwnership } from "../src/lifecycle";
it("remembers script ownership before scanning is enabled and refuses old scripts in a new route", () => {
  const scopes = new ScriptOwnership("a"),
    old = {},
    fresh = {};
  scopes.observe([old]);
  scopes.change("b", [old]);
  scopes.observe([old, fresh]);
  expect(scopes.belongs(old, "b")).toBe(false);
  expect(scopes.belongs(fresh, "b")).toBe(true);
});
it("keeps user selection when reopening a panel with newly discovered images", () => {
  const c = { platform: "qianwen" as const, conversationId: "a" },
    a = {
      ...c,
      assetId: "a",
      messageId: "m",
      originalUrl: "https://workspace-zb-cdn.qianwen.com/a.png",
      source: "structured",
      width: 1,
      height: 1,
    };
  const r = new Registry(c);
  r.merge([a]);
  r.open();
  r.selected.clear();
  r.merge([{ ...a, assetId: "b" }]);
  r.open();
  expect(r.selected.size).toBe(0);
});
