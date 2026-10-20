declare module "bzip2" {
  type Bits = (count: number) => number;
  const bzip2: {
    array(bytes: Uint8Array): Bits;
    header(bits: Bits): number;
    decompress(bits: Bits, size: number): Uint8Array | -1;
  };
  export default bzip2;
}
