/** Descriptions for fields the served schema does not describe. The
 * schema's own description always wins; these fill the gaps until a
 * release carries them. Keys are "type-slug.field" or "*.field". */
export const FIELD_NOTES: Record<string, string> = {
  "header.schema_version": "The shape of the file. Goes up when a field is added; a breaking change is a new major release instead.",
  "header.source": "The official API the data was read from.",
  "header.sets": "How many records the sets section holds.",
  "header.cards": "How many records the cards section holds.",
  "header.printings": "How many records the printings section holds.",
  "header.slug_history": "How many rows the slug_history section holds.",
  "header.name_history": "How many rows the name_history section holds.",
  "header.card_history": "How many rows the card_history section holds.",

  "set.set_code": "The official three-digit code. A label, not an order: 003 is unused.",
  "set.set_name": "The official display name.",
  "set.cards": "Distinct cards in the set.",
  "set.printings": "Printings in the set.",

  "card.codex_id": "The card's permanent ID.",
  "card.name": "The current name. Earlier names are in name_history.",
  "*.attack": "Printed attack; null when the card has none.",
  "*.defense": "Printed defense; null when the card has none.",
  "*.thr_air": "Air threshold: the number of Air the card needs in play to be cast. 0 when none.",
  "*.thr_earth": "Earth threshold. 0 when none.",
  "*.thr_fire": "Fire threshold. 0 when none.",
  "*.thr_water": "Water threshold. 0 when none.",

  "printing.printing_id": "This printing's permanent ID.",
  "printing.codex_id": "The card this is a printing of.",
  "printing.set_name": "The set's official display name.",
  "printing.set_code": "The set's official three-digit code.",
  "printing.artist": "The artist as credited; null when unrecorded.",
  "printing.flavour_text": "The flavour text as printed; empty or null when the card has none.",
  "printing.image_status": "How good the source of the front image was: missing, lowres or ok.",

  "slug-history.slug": "The slug, exactly as the official API issued it.",
  "slug-history.printing_id": "The printing it belonged to. A slug belongs to one printing, ever.",
  "slug-history.valid_from": "The first date the registry saw this slug.",
  "slug-history.valid_to": "The date it was replaced; null while it is the current slug.",

  "name-history.name": "The name, exactly as the official API gave it.",
  "name-history.codex_id": "The card that carried the name.",
  "name-history.valid_from": "The first date the registry saw this name.",
  "name-history.valid_to": "The date it was replaced; null while it is the current name.",

  "card-history.codex_id": "The card this face belongs to.",
  "card-history.valid_from": "Start of the range this face was in force. What the date means depends on source.",
  "card-history.valid_to": "End of the range; null for the current face.",
  "card-history.back": "The back face at that time; null unless the card is double-faced.",
};
