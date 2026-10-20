import type { Request } from "@/audio/contracts";
import { rpc } from "@/platform/messaging/send";

export const audioClient = <R extends Request>(request: R) => rpc(request);
