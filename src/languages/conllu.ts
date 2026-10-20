import type { AnalysisSentence, AnalysisToken } from "@/languages/analysis";

function attributes(value: string) {
  return Object.fromEntries(
    value === "_"
      ? []
      : value.split("|").map((part) => {
          const separator = part.indexOf("=");
          return [part.slice(0, separator), part.slice(separator + 1)];
        }),
  );
}

export function parseConllu(result: string, text: string): AnalysisSentence[] {
  const offsets = [0];
  for (const character of text)
    offsets.push(offsets[offsets.length - 1]! + character.length);
  return result
    .trim()
    .split(/\r?\n\s*\r?\n/u)
    .filter(Boolean)
    .map((sentence) => {
      const metadata: Record<string, string> = {};
      const tokens: AnalysisToken[] = [];
      for (const line of sentence.split(/\r?\n/u)) {
        if (line.startsWith("#")) {
          const match = /^#\s*([^=]+?)(?:\s*=\s*(.*))?$/u.exec(line);
          if (match) metadata[match[1]!.trim()] = match[2] ?? "";
          continue;
        }
        const columns = line.split("\t");
        if (columns.length !== 10 || !/^\d+(?:[-.]\d+)?$/u.test(columns[0]!))
          throw new Error("Invalid UDPipe token");
        const [id, form, lemma, upos, xpos, feats, head, deprel, deps, misc] =
          columns as [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
          ];
        const token: AnalysisToken = {
          id,
          form,
          lemma,
          upos,
          xpos,
          feats: attributes(feats),
          head,
          deprel,
          deps,
          misc: attributes(misc),
        };
        if (token.misc.TokenRange) {
          const range = /^(\d+):(\d+)$/u.exec(token.misc.TokenRange);
          const start = range && offsets[+range[1]!];
          const end = range && offsets[+range[2]!];
          if (
            typeof start !== "number" ||
            typeof end !== "number" ||
            end <= start ||
            text.slice(start, end) !== form
          )
            throw new Error("UDPipe token does not match original text");
          token.start = start;
          token.end = end;
        } else if (
          !id.includes(".") &&
          !tokens.some((parent) => {
            if (!parent.id.includes("-")) return false;
            const [first, last] = parent.id.split("-").map(Number);
            return +id >= first! && +id <= last!;
          })
        )
          throw new Error("Missing UDPipe token range");
        tokens.push(token);
      }
      return { metadata, tokens };
    });
}
