import { rpc, RpcError } from "@/platform/messaging/send";
import type { Request, Responses } from "@/srs/contracts";

async function rescheduleModel() {
  try {
    let result: Responses["rescheduleModel"];
    do {
      result = await rpc({ action: "rescheduleModel" });
      window.dispatchEvent(
        new CustomEvent("srs-progress", {
          detail: {
            rescheduled: result.count,
            skipped: result.skipped,
            ready: result.cursor === null,
          },
        }),
      );
    } while (result.cursor !== null);
  } catch (error) {
    window.dispatchEvent(new CustomEvent("srs-progress"));
    throw error;
  }
}

export async function srsClient<R extends Request>(
  request: R,
): Promise<Responses[R["action"]]> {
  while (true) {
    try {
      const result = await rpc(request);
      if (request.action === "activateAlgorithm") await rescheduleModel();
      return result;
    } catch (error) {
      if (
        !(error instanceof RpcError) ||
        !["RWKV_NOT_READY", "SRS_RESCHEDULE_REQUIRED"].includes(
          error.code ?? "",
        )
      )
        throw error;
      if (error.code === "SRS_RESCHEDULE_REQUIRED") {
        await rescheduleModel();
        continue;
      }
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
