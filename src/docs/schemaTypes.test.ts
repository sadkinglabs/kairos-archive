import { describe, expect, it } from "vitest";
import { TYPES, typeDocs, typeName } from "./schemaTypes";

const schema = {
  $defs: {
    codexId: { type: "string", pattern: "^C[0-9]{6}$" },
    date: { type: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
    threshold: { type: "integer", minimum: 0 },
    imageStatus: { type: "string", enum: ["missing", "lowres", "ok"] },
    imageUrls: { type: "object", properties: { small: { type: "string" }, normal: { type: "string" } } },
    face: { type: "object", properties: { cost: { type: ["integer", "null"] } } },
  },
  properties: {
    header: { type: "object", description: "Counts.", properties: { cards: { type: "integer" } } },
    sets: { type: "array", items: { type: "object", properties: { set_code: { type: "string" } } } },
    cards: { type: "array", items: { type: "object", description: "One per card.", properties: {
      codex_id: { $ref: "#/$defs/codexId" },
      name: { type: "string" },
      cost: { type: ["integer", "null"], description: "From the schema." },
      thr_air: { $ref: "#/$defs/threshold" },
      elements: { type: "array", items: { type: "string" } },
      back: { anyOf: [{ $ref: "#/$defs/face" }, { type: "null" }] },
      image_urls: { anyOf: [{ $ref: "#/$defs/imageUrls" }, { type: "null" }] },
      image_status: { $ref: "#/$defs/imageStatus" },
    } } },
    printings: { type: "array", items: { type: "object", properties: { released_at: { anyOf: [{ $ref: "#/$defs/date" }, { type: "null" }] } } } },
    card_history: { type: "array", items: { type: "object", properties: {} } },
    name_history: { type: "array", items: { type: "object", properties: {} } },
    slug_history: { type: "array", items: { type: "object", properties: {} } },
  },
};

describe("typeName", () => {
  const t = (def: unknown) => typeName(def, schema);
  it("reads plain, nullable and array types", () => {
    expect(t({ type: "string" })).toBe("string");
    expect(t({ type: ["integer", "null"] })).toBe("integer or null");
    expect(t({ type: "array", items: { type: "string" } })).toBe("array of string");
  });
  it("names the registry's $defs in words", () => {
    expect(t({ $ref: "#/$defs/codexId" })).toBe("codex ID, C plus six digits");
    expect(t({ $ref: "#/$defs/threshold" })).toBe("integer, 0 or more");
    expect(t({ anyOf: [{ $ref: "#/$defs/date" }, { type: "null" }] })).toBe("date, YYYY-MM-DD or null");
  });
  it("lists an enum and an object's keys", () => {
    expect(t({ $ref: "#/$defs/imageStatus" })).toBe('"missing", "lowres" or "ok"');
    expect(t({ anyOf: [{ $ref: "#/$defs/imageUrls" }, { type: "null" }] })).toBe("object: small, normal or null");
    expect(t({ anyOf: [{ $ref: "#/$defs/face" }, { type: "null" }] })).toBe("face object: the gameplay fields of a card (see Card) or null");
  });
  it("refuses a reference it cannot resolve", () => {
    expect(() => t({ $ref: "#/$defs/nope" })).toThrow(/no \$defs\.nope/);
  });
});

describe("typeDocs", () => {
  const notes = { "card.name": "Fallback for name.", "*.codex_id": "Wildcard for codex_id.", "card.cost": "Should lose to the schema." };
  const docs = typeDocs(schema, notes);
  it("produces one page per type, in order, from the section's items", () => {
    expect(docs.map((d) => d.slug)).toEqual(TYPES.map((t) => t.slug));
    const card = docs.find((d) => d.slug === "card")!;
    expect(card.summary).toBe("One per card.");
    expect(card.fields.map((f) => f.name)).toEqual(["codex_id", "name", "cost", "thr_air", "elements", "back", "image_urls", "image_status"]);
  });
  it("reads the header as an object rather than an array", () => {
    const header = docs.find((d) => d.slug === "header")!;
    expect(header.summary).toBe("Counts.");
    expect(header.fields).toEqual([{ name: "cards", type: "integer", description: "" }]);
  });
  it("prefers the schema's description, then the field note, then the wildcard note", () => {
    const card = docs.find((d) => d.slug === "card")!;
    const by = Object.fromEntries(card.fields.map((f) => [f.name, f.description]));
    expect(by.cost).toBe("From the schema.");
    expect(by.name).toBe("Fallback for name.");
    expect(by.codex_id).toBe("Wildcard for codex_id.");
    expect(by.elements).toBe("");
  });
});
