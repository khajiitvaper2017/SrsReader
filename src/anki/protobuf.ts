import { t } from "@/shared/i18n/i18n";
import { parseJson } from "@/anki/json";

type Value = bigint | Uint8Array;

export class Proto {
  private fields = new Map<number, Value[]>();

  constructor(bytes: Uint8Array) {
    let offset = 0;
    const varint = () => {
      let value = 0n;
      for (let shift = 0n; shift < 70n; shift += 7n) {
        const byte = bytes[offset++];
        if (byte === undefined) throw new Error(t("anki_invalid_package"));
        value |= BigInt(byte & 127) << shift;
        if (!(byte & 128)) return value;
      }
      throw new Error(t("anki_invalid_package"));
    };
    while (offset < bytes.length) {
      const tag = Number(varint());
      const field = tag >>> 3;
      const wire = tag & 7;
      if (!field) throw new Error(t("anki_invalid_package"));
      let value: Value;
      if (wire === 0) value = varint();
      else if (wire === 2) {
        const size = Number(varint());
        if (!Number.isSafeInteger(size) || offset + size > bytes.length)
          throw new Error(t("anki_invalid_package"));
        value = bytes.subarray(offset, offset + size);
        offset += size;
      } else if (wire === 1 || wire === 5) {
        const size = wire === 1 ? 8 : 4;
        if (offset + size > bytes.length)
          throw new Error(t("anki_invalid_package"));
        value = bytes.subarray(offset, offset + size);
        offset += size;
      } else throw new Error(t("anki_invalid_package"));
      const values = this.fields.get(field) ?? [];
      values.push(value);
      this.fields.set(field, values);
    }
  }

  values(field: number) {
    return this.fields.get(field) ?? [];
  }
  number(field: number, fallback = 0) {
    const value = this.values(field)[0];
    return typeof value === "bigint" ? Number(value) : fallback;
  }
  floats(field: number) {
    return this.values(field).flatMap((value) => {
      if (!(value instanceof Uint8Array) || value.byteLength % 4) return [];
      const view = new DataView(
        value.buffer,
        value.byteOffset,
        value.byteLength,
      );
      return Array.from({ length: value.byteLength / 4 }, (_, index) =>
        view.getFloat32(index * 4, true),
      );
    });
  }
  integer(field: number) {
    const value = this.values(field)[0];
    return typeof value === "bigint"
      ? BigInt.asIntN(64, value).toString()
      : undefined;
  }
  bytes(field: number) {
    const value = this.values(field)[0];
    return value instanceof Uint8Array ? value : new Uint8Array();
  }
  text(field: number) {
    return new TextDecoder().decode(this.bytes(field));
  }
  other() {
    const json = this.text(255);
    if (!json) return {};
    const value = parseJson(json);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(t("anki_invalid_package"));
    return value as Record<string, unknown>;
  }
}
