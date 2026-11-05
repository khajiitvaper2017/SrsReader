import { rpc } from "@/platform/messaging/send";
import type { Request, Responses } from "@/sync/contracts";

export function syncClient<R extends Request>(
  request: R,
): Promise<Responses[R["action"]]> {
  return rpc(request);
}
