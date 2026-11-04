import { compoundGrammar } from "@/languages/udpipe";
import type { Request } from "@/lookup/contracts";
import { t } from "@/shared/i18n/i18n";
import type { LookupPage } from "@/lookup/model";

const sessions = new Map<string, LookupPage>();

export const handleLookup = execute;
async function execute(request: Request) {
  switch (request.action) {
    case "createSession": {
      const id = crypto.randomUUID();
      if (sessions.size > 100) sessions.delete(sessions.keys().next().value!);
      sessions.set(id, {
        term: request.term,
        context: request.context,
        occurrence: request.occurrence,
        compound: request.compound,
        refineContext: request.refineContext,
      });
      return id;
    }
    case "session": {
      const session = sessions.get(request.id);
      if (!session)
        throw new Error(t("this_lookup_expired_hover_over_the_word_again"));
      return session;
    }
    case "compoundGrammar":
      return compoundGrammar(request.occurrence, request.surface);
    case "closeLookup":
      return;
  }
}
