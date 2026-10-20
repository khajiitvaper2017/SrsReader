import { rpc, RpcError } from "@/platform/messaging/send";
import type { Request, Responses } from "@/srs/contracts";

export async function srsClient<R extends Request>(
  request: R,
): Promise<Responses[R["action"]]> {
  while (true) {
    try {
      return await rpc(request);
    } catch (error) {
      if (!(error instanceof RpcError) || error.code !== "RWKV_NOT_READY")
        throw error;
      window.dispatchEvent(
        new CustomEvent("srs-progress", {
          detail: { processed: 0, total: 0, ready: false },
        }),
      );
      try {
        let progress: Responses["prepareRwkv"];
        do {
          progress = await rpc({ action: "prepareRwkv" });
          window.dispatchEvent(
            new CustomEvent("srs-progress", { detail: progress }),
          );
        } while (!progress.ready);
      } catch (error) {
        window.dispatchEvent(new CustomEvent("srs-progress"));
        throw error;
      }
    }
  }
}
