import { rpc } from "@/platform/messaging/send";
import type { Request } from "@/vocabulary/contracts";

export const vocabularyClient = <R extends Request>(request: R) => rpc(request);
