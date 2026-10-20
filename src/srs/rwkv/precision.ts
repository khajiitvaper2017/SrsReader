import type { LayerState } from "@/srs/rwkv/model";
export type PackedLayer = {
  shift: Uint16Array;
  scales: Float32Array;
  codes: Int8Array;
  channel?: Uint16Array;
};
export type StoredLayers =
  | { compact: true; layers: PackedLayer[] }
  | { compact: false; layers: LayerState[] };
const f32 = Math.fround;
export function roundEven(value: number) {
  const floor = Math.floor(value),
    fraction = value - floor;
  return fraction === 0.5
    ? floor % 2 === 0
      ? floor
      : floor + 1
    : Math.round(value);
}
export function toHalf(value: number) {
  const sign = value < 0 || Object.is(value, -0) ? 0x8000 : 0;
  const x = Math.abs(value);
  if (Number.isNaN(x)) return 0x7e00;
  if (!Number.isFinite(x)) return sign | 0x7c00;
  if (x < 2 ** -14) return sign | roundEven(x / 2 ** -24);
  let exponent = Math.floor(Math.log2(x));
  let fraction = roundEven((x / 2 ** exponent - 1) * 1024);
  if (fraction === 1024) {
    exponent++;
    fraction = 0;
  }
  return exponent > 15
    ? sign | 0x7c00
    : sign | ((exponent + 15) << 10) | fraction;
}
export function fromHalf(value: number) {
  const sign = value & 0x8000 ? -1 : 1,
    exponent = (value >> 10) & 31,
    fraction = value & 1023;
  return exponent === 31
    ? fraction
      ? NaN
      : sign * Infinity
    : sign *
        (exponent
          ? (1 + fraction / 1024) * 2 ** (exponent - 15)
          : fraction * 2 ** -24);
}
export function pack(layers: LayerState[], compact: boolean): StoredLayers {
  if (!compact) return { compact: false, layers };
  return {
    compact: true,
    layers: layers.map((layer) => {
      const scales = new Float32Array(layer.matrix.length / 16),
        codes = new Int8Array(layer.matrix.length);
      for (let row = 0; row < scales.length; row++) {
        let max = 0;
        for (let j = 0; j < 16; j++)
          max = Math.max(max, Math.abs(layer.matrix[row * 16 + j]!));
        const scale = (scales[row] = max ? f32(max / 127) : 1);
        for (let j = 0; j < 16; j++)
          codes[row * 16 + j] = Math.max(
            -127,
            Math.min(127, roundEven(f32(layer.matrix[row * 16 + j]! / scale))),
          );
      }
      return {
        scales,
        codes,
        shift: Uint16Array.from(layer.shift, toHalf),
        channel: layer.channel && Uint16Array.from(layer.channel, toHalf),
      };
    }),
  };
}
export function unpack(stored: StoredLayers): LayerState[] {
  if (!stored.compact) return stored.layers;
  return stored.layers.map((layer) => ({
    shift: Float32Array.from(layer.shift, fromHalf),
    matrix: Float32Array.from(
      layer.codes,
      (value, index) => value * layer.scales[Math.floor(index / 16)]!,
    ),
    channel: layer.channel && Float32Array.from(layer.channel, fromHalf),
  }));
}
