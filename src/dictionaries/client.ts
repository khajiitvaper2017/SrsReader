import type { Request } from "@/dictionaries/contracts";
import { rpc } from "@/platform/messaging/send";
export const dictionariesClient = <R extends Request>(request: R) =>
  rpc(request);
