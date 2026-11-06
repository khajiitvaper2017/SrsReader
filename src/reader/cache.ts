import type { ScanResult } from "@/reader/contracts";

export const scanCache = { results: new Map<string, ScanResult[]>() };
