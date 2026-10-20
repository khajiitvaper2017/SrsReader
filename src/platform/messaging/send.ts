import type { Request, Responses } from "@/background/contracts";
import { t } from "@/shared/i18n/i18n";
import { browser } from "wxt/browser";

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}
export async function rpc<R extends Request>(
  request: R,
): Promise<Responses[R["action"]]> {
  const response = await browser.runtime.sendMessage(request);
  if (!response || response.error)
    throw new RpcError(
      response?.error || t("the_extension_could_not_respond_reload_this_page"),
      response?.code,
    );
  return response.value;
}
