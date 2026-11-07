import type { Request } from "@/examples/contracts";
import { wordExamples } from "@/examples/query";

self.onmessage = async (
  event: MessageEvent<{
    id: string;
    request: Extract<Request, { action: "examples" }>;
  }>,
) => {
  const { id, request } = event.data;
  try {
    const value = await wordExamples(
      request.lemma,
      request.language,
      request.surface,
    );
    self.postMessage({ id, value });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
