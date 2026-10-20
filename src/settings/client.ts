import { rpc } from "@/platform/messaging/send";
import type { Request, Responses } from "@/settings/contracts";
import { settingsSchema } from "@/settings/model";

export async function settingsClient<R extends Request>(
  request: R,
): Promise<Responses[R["action"]]> {
  return settingsSchema.parse(await rpc(request));
}
