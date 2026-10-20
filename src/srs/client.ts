import { rpc } from "@/platform/messaging/send";
import type { Request } from "@/srs/contracts";
export const srsClient = <R extends Request>(request: R) => rpc(request);
