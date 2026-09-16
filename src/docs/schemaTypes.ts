/** Type reference pages, generated from the release's own schema.json so a
 * field added to the registry appears in the docs on the next deploy with
 * nothing typed twice. Pure: takes the parsed schema and a map of fallback
 * descriptions for fields the schema does not describe (the schema's own
 * description wins whenever it has one). */

export type JsonSchema = Record<string, unknown>;
export interface FieldDoc { name: string; type: string; description: string }
export interface TypeDoc {
  slug: string;
  title: string;
  /** The registry.json section the type is the item of ("header" is the object itself). */
  section: string;
  summary: string;
  fields: FieldDoc[];
}

export const TYPES: { slug: string; title: string; section: string }[] = [
  { slug: "card", title: "Card", section: "cards" },
  { slug: "printing", title: "Printing", section: "printings" },
  { slug: "set", title: "Set", section: "sets" },
  { slug: "card-history", title: "Card history row", section: "card_history" },
  { slug: "name-history", title: "Name history row", section: "name_history" },
  { slug: "slug-history", title: "Slug history row", section: "slug_history" },
  { slug: "header", title: "Header", section: "header" },
];

/** How a $defs entry reads in a type column. Anything not listed is
 * described from its own schema (enum, pattern, properties). */
const DEF_NAMES: Record<string, string> = {
  codexId: "codex ID, C plus six digits",
  printingId: "printing ID, P plus six digits",
  date: "date, YYYY-MM-DD",
  threshold: "integer, 0 or more",
  setCode: "set code, three digits",
  face: "face object: the gameplay fields of a card (see Card)",
};

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function resolve(ref: string, schema: JsonSchema): { name: string; node: Record<string, unknown> } {
  const m = /^#\/\$defs\/([A-Za-z0-9_]+)$/.exec(ref);
  if (!m) throw new Error(`unsupported $ref ${ref}`);
  const defs = obj(schema.$defs) ?? {};
  const node = obj(defs[m[1]]);
  if (!node) throw new Error(`schema has no $defs.${m[1]}`);
  return { name: m[1], node };
}

/** A field's type in words: "string or null", "array of string",
 * "\"missing\", \"lowres\" or \"ok\"", "date, YYYY-MM-DD or null". */
export function typeName(def: unknown, schema: JsonSchema): string {
  const d = obj(def);
  if (!d) return "unknown";
  if (typeof d.$ref === "string") {
    const { name, node } = resolve(d.$ref, schema);
    return DEF_NAMES[name] ?? typeName(node, schema);
  }
  const anyOf = Array.isArray(d.anyOf) ? d.anyOf : null;
  if (anyOf) {
    const parts = anyOf.filter((x) => obj(x)?.type !== "null").map((x) => typeName(x, schema));
    const nullable = anyOf.some((x) => obj(x)?.type === "null");
    return nullable ? `${parts.join(" or ")} or null` : parts.join(" or ");
  }
  if (Array.isArray(d.enum)) {
    const values = d.enum.map((v) => JSON.stringify(v));
    return values.length > 1 ? `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}` : values[0];
  }
  const types = Array.isArray(d.type) ? (d.type as string[]) : typeof d.type === "string" ? [d.type] : [];
  const nullable = types.includes("null");
  const main = types.filter((t) => t !== "null");
  let word = main.join(" or ") || "unknown";
  if (main.includes("array")) word = `array of ${typeName(d.items, schema)}`;
  if (main.includes("object")) {
    const props = obj(d.properties);
    word = props ? `object: ${Object.keys(props).join(", ")}` : "object";
  }
  if (main.includes("integer") && typeof d.minimum === "number") word = `integer, ${d.minimum} or more`;
  return nullable ? `${word} or null` : word;
}

/** Every type page, in TYPES order. Descriptions: the schema's own, else
 * notes["slug.field"], else notes["*.field"], else empty. */
export function typeDocs(schema: JsonSchema, notes: Record<string, string> = {}): TypeDoc[] {
  const props = obj(schema.properties) ?? {};
  return TYPES.map(({ slug, title, section }) => {
    const sectionNode = obj(props[section]);
    if (!sectionNode) throw new Error(`schema has no section ${section}`);
    const node = section === "header" ? sectionNode : obj(sectionNode.items);
    if (!node) throw new Error(`schema section ${section} has no items`);
    const fields = Object.entries(obj(node.properties) ?? {}).map(([name, def]) => {
      const d = obj(def) ?? {};
      const description = typeof d.description === "string" ? d.description : notes[`${slug}.${name}`] ?? notes[`*.${name}`] ?? "";
      return { name, type: typeName(def, schema), description };
    });
    return { slug, title, section, summary: typeof node.description === "string" ? node.description : "", fields };
  });
}
