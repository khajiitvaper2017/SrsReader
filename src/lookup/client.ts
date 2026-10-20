import type { Request } from "@/lookup/contracts";
import { rpc } from "@/platform/messaging/send";

export const lookupClient = <R extends Request>(request: R) => rpc(request);
