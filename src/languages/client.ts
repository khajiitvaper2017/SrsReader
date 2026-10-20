import type { Request } from "@/languages/contracts";
import { rpc } from "@/platform/messaging/send";
export const languagesClient = <R extends Request>(request: R) => rpc(request);
