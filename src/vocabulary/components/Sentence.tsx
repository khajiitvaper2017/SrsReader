import type { ReadingContext } from "@/vocabulary/model";

export function Sentence({
  context,
  language,
}: {
  context: ReadingContext;
  language: string;
}) {
  return (
    <span lang={language} dir="auto">
      {context.sentence.slice(0, context.start)}
      <mark>{context.sentence.slice(context.start, context.end)}</mark>
      {context.sentence.slice(context.end)}
    </span>
  );
}
