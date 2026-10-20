import { rpc } from "@/platform/messaging/send";
import type { Request } from "@/settings/contracts";
export const settingsClient = <R extends Request>(request: R) => rpc(request);
