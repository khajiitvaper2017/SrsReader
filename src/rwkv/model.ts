const f32 = Math.fround;
export type Tensor = { shape: number[]; data: Float32Array };
export type ModelSpec = {
  d_model: number;
  zero_features: number[];
  layer_steps: [number, number][];
  streams: {
    name: string;
    n_layers: number;
    n_heads: number;
    channel_mixer_stripped_layers: number[];
  }[];
  constants: Record<string, number>;
};
export type LayerState = {
  shift: Float32Array;
  matrix: Float32Array;
  channel?: Float32Array;
};
export type Heads = {
  w: Float32Array;
  s: Float32Array;
  d: Float32Array;
  p: Float32Array;
};
export type EntityStates = Map<string, LayerState[]>;
export const entityKey = (stream: number, id: string) =>
  JSON.stringify([stream, id]);

export function readWeights(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const int8 =
    decoder.decode(bytes.subarray(0, "ARWKVWEIGHTS8PC1".length)) ===
    "ARWKVWEIGHTS8PC1";
  const magic = int8 ? "ARWKVWEIGHTS8PC1" : "ARWKVWEIGHTS1";
  if (decoder.decode(bytes.subarray(0, magic.length)) !== magic)
    throw new Error("Invalid RWKV weights");
  let offset = magic.length;
  const u8 = () => view.getUint8(offset++);
  const u16 = () => {
    const value = view.getUint16(offset, true);
    offset += 2;
    return value;
  };
  const u32 = () => {
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  };
  const float = () => {
    const value = view.getFloat32(offset, true);
    offset += 4;
    return value;
  };
  const tensors = new Map<string, Tensor>();
  const count = u32();
  for (let index = 0; index < count; index++) {
    const length = u16();
    const name = decoder.decode(bytes.subarray(offset, offset + length));
    offset += length;
    const kind = int8 ? u8() : 0;
    const rank = u8();
    const shape = Array.from({ length: rank }, u32);
    const size = shape.reduce((a, b) => a * b, 1);
    const data = new Float32Array(size);
    if (kind === 1) {
      const scales = Array.from({ length: shape[0]! }, float);
      const width = size / shape[0]!;
      for (let i = 0; i < size; i++)
        data[i] = view.getInt8(offset++) * scales[Math.floor(i / width)]!;
    } else if (kind === 0) {
      for (let i = 0; i < size; i++) data[i] = float();
    } else throw new Error("Invalid RWKV tensor encoding");
    tensors.set(name, { shape, data });
  }
  if (offset !== buffer.byteLength)
    throw new Error("Invalid RWKV weights length");
  return tensors;
}

const sigmoid = (x: number) => f32(1 / f32(1 + f32(Math.exp(-x))));
const lerp = (a: number, b: number, w: number) =>
  Math.abs(w) < 0.5
    ? f32(a + f32(w * f32(b - a)))
    : f32(b - f32(f32(b - a) * f32(1 - w)));
const map = (
  values: Float32Array,
  fn: (value: number, index: number) => number,
) => values.map(fn);
const softmax = (x: Float32Array) => {
  const max = Math.max(...x);
  const out = x.map((v) => Math.exp(f32(v - max)));
  const sum = f32(out.reduce((a, b) => a + b, 0));
  return out.map((v) => v / sum);
};

export class RwkvModel {
  constructor(
    readonly weights: Map<string, Tensor>,
    readonly spec: ModelSpec,
  ) {}
  private tensor(name: string) {
    const tensor = this.weights.get(name);
    if (!tensor) throw new Error(`Missing RWKV tensor: ${name}`);
    return tensor.data;
  }
  private linear(x: Float32Array, prefix: string) {
    const tensor = this.weights.get(prefix + ".weight")!;
    if (tensor.shape[1] !== x.length)
      throw new Error(`Invalid RWKV shape: ${prefix}`);
    const bias = this.weights.get(prefix + ".bias")?.data;
    const out = new Float32Array(tensor.shape[0]!);
    for (let row = 0; row < out.length; row++) {
      let sum = 0;
      for (let col = 0; col < x.length; col++)
        sum += x[col]! * tensor.data[row * x.length + col]!;
      out[row] = f32(sum) + (bias?.[row] ?? 0);
    }
    return out;
  }
  private norm(x: Float32Array, prefix: string, groups = 1) {
    const out = new Float32Array(x.length);
    const weight = this.tensor(prefix + ".weight"),
      bias = this.tensor(prefix + ".bias");
    const width = x.length / groups;
    const eps =
      this.spec.constants[groups === 1 ? "layer_norm_eps" : "group_norm_eps"]!;
    for (let g = 0; g < groups; g++) {
      let mean = 0,
        variance = 0;
      for (let j = 0; j < width; j++) mean += x[g * width + j]!;
      mean = f32(mean / width);
      for (let j = 0; j < width; j++)
        variance += f32(f32(x[g * width + j]! - mean) ** 2);
      const scale = f32(Math.sqrt(f32(f32(variance / width) + eps)));
      for (let j = 0; j < width; j++) {
        const i = g * width + j;
        out[i] = f32(f32(f32(x[i]! - mean) / scale) * weight[i]!) + bias[i]!;
      }
    }
    return out;
  }
  private headLinear(x: Float32Array, weight: string, bias: string) {
    const w = this.tensor(weight),
      b = this.tensor(bias),
      out = new Float32Array(b.length);
    for (let i = 0; i < b.length; i++) {
      let sum = 0;
      for (let j = 0; j < x.length; j++) sum += x[j]! * w[i * x.length + j]!;
      out[i] = f32(sum) + b[i]!;
    }
    return out;
  }
  step(features: Float32Array, ids: string[], store: EntityStates) {
    const input = features.slice();
    for (const index of this.spec.zero_features) input[index] = 0;
    let x = map(this.linear(input, "features2card.0"), (v) => v * sigmoid(v));
    x = this.norm(x, "features2card.2");
    x = map(this.linear(x, "features2card.3"), (v) => v * sigmoid(v));
    const values: (Float32Array | undefined)[] = [];
    const pending: EntityStates = new Map();
    for (const [stream, layer] of this.spec.layer_steps) {
      const spec = this.spec.streams[stream]!;
      const key = entityKey(stream, ids[stream]!);
      const old = store.get(key)?.[layer];
      const prefix = `rwkv_modules.${stream}.blocks.${layer}`;
      const p = prefix + ".time_mixer";
      const xl = this.norm(x, p + ".layer_norm");
      const xs = old?.shift ?? xl;
      const mix = this.tensor(p + ".rkvdag_lerp");
      const mixed = Array.from({ length: 8 }, (_, j) =>
        xl.map((v, k) => lerp(v, xs[k]!, mix[j * xl.length + k]!)),
      );
      const r = this.linear(mixed[0]!, p + ".W_r");
      const k = this.linear(mixed[1]!, p + ".W_k");
      const ks = map(this.linear(mixed[6]!, p + ".k_scale_linear"), sigmoid);
      const vs = map(this.linear(mixed[7]!, p + ".v_scale_linear"), sigmoid);
      let v = this.linear(mixed[2]!, p + ".W_v");
      if (layer === 0) values[stream] = v;
      else {
        const amount = map(
          this.linear(
            this.linear(mixed[2]!, p + ".v_lora_simple.A"),
            p + ".v_lora_simple.B_and_lamb",
          ),
          sigmoid,
        );
        v = v.map((value, i) => lerp(value, values[stream]![i]!, amount[i]!));
      }
      const a = map(
        this.linear(
          this.linear(mixed[4]!, p + ".a_lora_simple.A"),
          p + ".a_lora_simple.B_and_lamb",
        ),
        sigmoid,
      );
      const gate = this.linear(
        map(this.linear(mixed[5]!, p + ".lora_A_g"), sigmoid),
        p + ".lora_B_g",
      );
      const decay = this.linear(
        map(this.linear(mixed[3]!, p + ".d_lora_mlp.A"), Math.tanh),
        p + ".d_lora_mlp.B_and_lamb",
      );
      const w = decay.map((d) => {
        const z = -d;
        const softplus =
          z > this.spec.constants.softplus_threshold!
            ? z
            : f32(Math.log1p(f32(Math.exp(z))));
        return Math.exp(-f32(Math.exp(f32(-0.5 - f32(softplus)))));
      });
      const size = x.length / spec.n_heads;
      const matrix = new Float32Array(spec.n_heads * size * size);
      const out = new Float32Array(x.length),
        bonus = new Float32Array(x.length);
      const bonusWeight = this.tensor(p + ".bonus");
      for (let h = 0; h < spec.n_heads; h++) {
        let kn = 0,
          vn = 0;
        for (let j = 0; j < size; j++) {
          kn += f32(k[h * size + j]! ** 2);
          vn += f32(v[h * size + j]! ** 2);
        }
        kn = Math.max(
          f32(Math.sqrt(f32(kn))),
          this.spec.constants.normalize_eps!,
        );
        vn = Math.max(
          f32(Math.sqrt(f32(vn))),
          this.spec.constants.normalize_eps!,
        );
        const kd = new Float32Array(size),
          vv = new Float32Array(size),
          kb = new Float32Array(size);
        for (let j = 0; j < size; j++) {
          const i = h * size + j;
          kd[j] = ks[h]! * f32(k[i]! / kn);
          vv[j] = vs[h]! * f32(v[i]! / vn);
          kb[j] = kd[j]! * a[i]!;
        }
        let b = 0;
        for (let j = 0; j < size; j++) {
          const i = h * size + j;
          b += f32(f32(r[i]! * bonusWeight[i]!) * kb[j]!);
        }
        b = f32(b);
        for (let i = 0; i < size; i++) {
          let dot = 0,
            result = 0;
          for (let j = 0; j < size; j++)
            dot += (old?.matrix[(h * size + i) * size + j] ?? 0) * kd[j]!;
          dot = f32(dot);
          for (let j = 0; j < size; j++) {
            const index = (h * size + i) * size + j;
            matrix[index] =
              f32(
                f32((old?.matrix[index] ?? 0) * w[h * size + j]!) -
                  f32(dot * kb[j]!),
              ) + f32(vv[i]! * kb[j]!);
            result += matrix[index]! * r[h * size + j]!;
          }
          out[h * size + i] = result;
          bonus[h * size + i] = b * vv[i]!;
        }
      }
      const normalized = this.norm(out, p + ".out_group_norm", spec.n_heads);
      const projected = this.linear(
        normalized.map((v, i) => gate[i]! * f32(v + bonus[i]!)),
        p + ".W_o",
      );
      x = x.map((v, i) => v + projected[i]!);
      const next: LayerState = { shift: xl, matrix };
      if (!spec.channel_mixer_stripped_layers.includes(layer)) {
        const p = prefix + ".channel_mixer";
        const current = this.norm(x, p + ".layer_norm");
        const previous = old?.channel ?? current;
        const amount = this.tensor(p + ".lerp_k");
        const projected = this.linear(
          map(
            this.linear(
              current.map((v, i) => lerp(v, previous[i]!, amount[i]!)),
              p + ".W_k",
            ),
            (v) => Math.max(0, v) ** 2,
          ),
          p + ".W_v",
        );
        x = x.map((v, i) => v + projected[i]!);
        next.channel = current;
      }
      const states = pending.get(key) ?? [];
      states[layer] = next;
      pending.set(key, states);
    }
    x = this.norm(x, "prehead_norm");
    let trunk = map(this.linear(x, "head_w.0"), (v) => Math.max(0, v));
    trunk = this.linear(this.norm(trunk, "head_w.2"), "head_w.4");
    const heads: Heads = {
      w: this.headLinear(trunk, "gru_w_weight", "gru_w_bias"),
      s: this.headLinear(trunk, "gru_s_weight", "gru_s_bias"),
      d: this.headLinear(trunk, "gru_d_weight", "gru_d_bias"),
      p: this.linear(
        map(this.linear(x, "head_p.0"), (v) => Math.max(0, v)),
        "p_linear",
      ),
    };
    return { heads, states: pending };
  }
  curve(heads: Pick<Heads, "w" | "s" | "d">, elapsedSeconds: number) {
    const c = this.spec.constants;
    const mix = softmax(heads.w);
    const t = f32(Math.max(elapsedSeconds, c.min_elapsed_seconds!));
    let recall = 0;
    for (let i = 0; i < mix.length; i++) {
      const scale = f32(
        Math.exp(
          Math.max(-c.power_clamp!, Math.min(c.power_clamp!, heads.s[i]!)),
        ),
      );
      const decay = f32(
        Math.exp(
          Math.max(-c.power_clamp!, Math.min(c.power_clamp!, heads.d[i]!)),
        ),
      );
      recall += f32(
        mix[i]! *
          f32(
            Math.exp(
              f32(
                -decay * f32(Math.log1p(f32(t / f32(c.power_s_eps! + scale)))),
              ),
            ),
          ),
      );
    }
    const raw = c.prob_clamp! + (1 - 2 * c.prob_clamp!) * f32(recall);
    return 1 / (1 + Math.exp(-(Math.log(raw / (1 - raw)) + c.prob_clamp!)));
  }
  instant(heads: Heads) {
    return softmax(heads.p);
  }
  interval(heads: Pick<Heads, "w" | "s" | "d">, retention: number) {
    let low = 1,
      high = 36500 * 86400;
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2;
      if (this.curve(heads, mid) > retention) low = mid;
      else high = mid;
    }
    return high / 86400;
  }
}
