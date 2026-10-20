import { rpc } from "@/platform/messaging/send";
import type { Request } from "@/reader/contracts";
export const readerClient = <R extends Request>(request: R) => rpc(request);
