import type { AnkiModel, RawObject } from "@/anki/model";
import type { NoteType } from "@/cards/model";
import { t } from "@/shared/i18n/i18n";

type Item = RawObject & { name: string; ord: number };
export const matchesNoteType = (model: AnkiModel, type: NoteType) =>
  type.sourceId === model.id ||
  String(type.source?.originalId || type.sourceId) ===
    String(model.originalId || model.id);

export const sameAnkiItem = (a: Item, b: Item) =>
  [a.id, b.id].every((id) => typeof id === "string" || typeof id === "number")
    ? String(a.id) === String(b.id)
    : a.name === b.name;

export function previousFields(type: NoteType): Item[] {
  const source = (type.source?.flds ?? []) as RawObject[];
  return type.fields.map((field, ord) => ({
    ...source[ord],
    name: field.name,
    ord,
  }));
}

function mergeItems<T extends Item>(current: T[], incoming: T[]) {
  const items = current.map((item) => ({ ...item }));
  const mapping = incoming.map((item) => {
    const matched = current.findIndex((existing) =>
      sameAnkiItem(existing, item),
    );
    const index = matched === -1 ? items.length : matched;
    items[index] = { ...items[index], ...item, ord: index };
    return index;
  });
  const names = new Set<string>();
  for (const item of items) {
    const name = item.name;
    for (let suffix = 2; names.has(item.name); suffix++)
      item.name = `${name} (${suffix})`;
    names.add(item.name);
  }
  return { items, mapping };
}

function renameFields(template: string, names: Map<string, string>) {
  return template.replace(
    /{{([#^/]?)([^{}]+)}}/g,
    (whole, section: string, value: string) => {
      const parts = value.split(":");
      const name = names.get(parts.at(-1)!.trim());
      if (!name) return whole;
      parts[parts.length - 1] = name;
      return `{{${section}${parts.join(":")}}}`;
    },
  );
}

export function mergeNoteType(incoming: AnkiModel, current: NoteType) {
  if ((incoming.type === 1) !== (current.kind === "cloze"))
    throw new Error(t("anki_merge_kind", { name: incoming.name }));
  const oldFields = previousFields(current);
  const fields = mergeItems(oldFields, incoming.flds);
  const sourceTemplates = (current.source?.tmpls ?? []) as RawObject[];
  const oldTemplates: AnkiModel["tmpls"] = current.templates.map(
    (template, ord) => ({
      ...sourceTemplates[ord],
      name: template.name,
      ord,
      qfmt: template.front,
      afmt: template.back,
    }),
  );
  const templates = mergeItems(oldTemplates, incoming.tmpls);
  const oldNames = new Map(
    oldFields.map((field, index) => [field.name, fields.items[index]!.name]),
  );
  const incomingNames = new Map(
    incoming.flds.map((field, index) => [
      field.name,
      fields.items[fields.mapping[index]!]!.name,
    ]),
  );
  const updatedTemplates = new Set(templates.mapping);
  const tmpls = templates.items.map((template, index) => {
    const names = updatedTemplates.has(index) ? incomingNames : oldNames;
    return {
      ...template,
      qfmt: renameFields(template.qfmt, names),
      afmt: renameFields(template.afmt, names),
      ...(typeof template.bqfmt === "string"
        ? { bqfmt: renameFields(template.bqfmt, names) }
        : {}),
      ...(typeof template.bafmt === "string"
        ? { bafmt: renameFields(template.bafmt, names) }
        : {}),
    };
  });
  const requirements = (incoming.req ?? []) as [number, string, number[]][];
  const oldRequirements = (current.source?.req ?? []) as [
    number,
    string,
    number[],
  ][];
  const model: AnkiModel = {
    ...current.source,
    ...incoming,
    flds: fields.items,
    tmpls,
    sortf: fields.mapping[Number(incoming.sortf ?? 0)] ?? 0,
    req: [
      ...oldRequirements.filter(([ordinal]) => !updatedTemplates.has(ordinal)),
      ...requirements.map(([ordinal, mode, indices]) => [
        templates.mapping[ordinal],
        mode,
        indices.map((index) => fields.mapping[index]),
      ]),
    ],
  };
  return { model, fieldMap: fields.mapping, templateMap: templates.mapping };
}

export function retainedFields(
  type: NoteType,
  values: string[],
  target: AnkiModel,
) {
  const fields = previousFields(type);
  return target.flds.map((field) => {
    const index = fields.findIndex((existing) => sameAnkiItem(existing, field));
    return index === -1 ? "" : (values[index] ?? "");
  });
}
