import type { Request } from "@/lookup/contracts";
import { t } from "@/shared/i18n/i18n";
import type { ReadingContext } from "@/vocabulary/model";
const sessions = new Map<string, { term: string; context?: ReadingContext }>();

export const handleLookup = execute;
async function execute(request: Request) {
  switch (request.action) {
    case "createSession": {
      const id = crypto.randomUUID();
      if (sessions.size > 100) sessions.delete(sessions.keys().next().value!);
      sessions.set(id, { term: request.term, context: request.context });
      return id;
    }
    case "session": {
      const session = sessions.get(request.id);
      if (!session)
        throw new Error(t("this_lookup_expired_hover_over_the_word_again"));
      return session;
    }
    case "closeLookup":
    case "resizeLookup":
      return;
  }
}
