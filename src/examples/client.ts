import type { Request } from "@/examples/contracts";
import { rpc } from "@/platform/messaging/send";

export const examplesClient = <R extends Request>(request: R) => rpc(request);
