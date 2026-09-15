import { describe, expect, it } from "vitest";
import { redirectLines } from "./redirects";

describe("redirectLines", () => {
  it("writes a bare-id line for every card, and an old-slug line for a closed rename", () => {
    const registry = {
      cards: [{ codex_id: "C000001", name: "Foo Bar" }],
      name_history: [
        { name: "Old Foo", codex_id: "C000001", valid_from: "2024-01-01", valid_to: "2025-01-01" },
        { name: "Foo Bar", codex_id: "C000001", valid_from: "2025-01-01", valid_to: null },
      ],
    };
    expect(redirectLines(registry)).toEqual([
      "/cards/C000001 /cards/C000001/foo-bar 302",
      "/cards/C000001/old-foo /cards/C000001/foo-bar 302",
    ]);
  });

  it("writes only the bare-id line for a card with no name history", () => {
    const registry = {
      cards: [{ codex_id: "C000002", name: "Never Renamed" }],
      name_history: [],
    };
    expect(redirectLines(registry)).toEqual(["/cards/C000002 /cards/C000002/never-renamed 302"]);
  });

  it("skips a closed rename whose slug is unchanged", () => {
    const registry = {
      cards: [{ codex_id: "C000003", name: "Foo, Bar" }],
      name_history: [
        { name: "Foo Bar", codex_id: "C000003", valid_from: "2024-01-01", valid_to: "2025-01-01" }, // same slug: "foo-bar"
        { name: "Foo, Bar", codex_id: "C000003", valid_from: "2025-01-01", valid_to: null },
      ],
    };
    expect(redirectLines(registry)).toEqual(["/cards/C000003 /cards/C000003/foo-bar 302"]);
  });

  it("ignores an open name_history row (the card's current name)", () => {
    const registry = {
      cards: [{ codex_id: "C000004", name: "Current Name" }],
      name_history: [{ name: "Current Name", codex_id: "C000004", valid_from: "2024-01-01", valid_to: null }],
    };
    expect(redirectLines(registry)).toEqual(["/cards/C000004 /cards/C000004/current-name 302"]);
  });

  it("deduplicates identical lines", () => {
    const registry = {
      cards: [{ codex_id: "C000005", name: "Foo" }],
      name_history: [
        { name: "Old Name", codex_id: "C000005", valid_from: "2024-01-01", valid_to: "2024-06-01" },
        { name: "Old Name", codex_id: "C000005", valid_from: "2024-06-01", valid_to: "2025-01-01" },
      ],
    };
    expect(redirectLines(registry)).toEqual([
      "/cards/C000005 /cards/C000005/foo 302",
      "/cards/C000005/old-name /cards/C000005/foo 302",
    ]);
  });
});
