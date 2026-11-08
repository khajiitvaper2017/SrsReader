import { config } from "zod/v4/core";

// Configure before schema construction: extension CSP also blocks Zod's Function probe.
config({ jitless: true });

export * from "zod/v4";
export { default } from "zod/v4";
