import type { OccurrenceGrammar } from "@/languages/analysis";
import { i18n, t } from "@/shared/i18n/i18n";
import { Group, Stack, Text } from "@mantine/core";

function label(section: string, key: string) {
  return t(`sentence_grammar.${section}.${key}`, {
    defaultValue: key,
    nsSeparator: false,
  });
}

function describeVerb(feats: Record<string, string>, pos = "VERB") {
  const value = (feature: string) =>
    (feats[feature] || "")
      .split(",")
      .filter(Boolean)
      .map((part) =>
        t(`sentence_grammar.verb_summary.${feature}.${part}`, {
          defaultValue: label(`values.${feature}`, part).toLocaleLowerCase(
            i18n.resolvedLanguage,
          ),
          nsSeparator: false,
        }),
      )
      .join(" / ");
  const number =
    feats.Person && i18n.resolvedLanguage === "uk"
      ? t(`sentence_grammar.verb_summary.agreement.${feats.Number}`, {
          defaultValue: value("Number"),
        })
      : value("Number");
  const agreement = [value("Person"), number].filter(Boolean).join(" ");
  const predicate = ["Tense", "Mood", "Voice", "Aspect"]
    .map(value)
    .filter(Boolean);
  const description =
    i18n.resolvedLanguage === "uk"
      ? [
          [
            value("Reflex"),
            label("pos", pos).toLocaleLowerCase("uk"),
            value("VerbForm"),
          ]
            .filter(Boolean)
            .join(" "),
          agreement,
          ...predicate,
        ]
          .filter(Boolean)
          .join(", ")
      : [
          value("VerbForm"),
          agreement,
          [
            ...predicate,
            value("Reflex"),
            label("pos", pos).toLocaleLowerCase("en"),
          ]
            .filter(Boolean)
            .join(" "),
        ]
          .filter(Boolean)
          .join(", ");
  const handled = new Set([
    "VerbForm",
    "Person",
    "Number",
    "Tense",
    "Mood",
    "Voice",
    "Aspect",
    "Reflex",
    "Gender",
    "Animacy",
    "Polarity",
  ]);
  const details = [
    ...["Gender", "Animacy", "Polarity"].map(value).filter(Boolean),
    ...Object.keys(feats)
      .filter((feature) => !handled.has(feature))
      .map((feature) => `${label("features", feature)}: ${value(feature)}`),
  ];
  return description + (details.length ? ` (${details.join(", ")})` : "");
}

function Features({ feats }: { feats: Record<string, string> }) {
  const entries = Object.entries(feats);
  return (
    <Group>
      {entries.map(([feature, value], index) => {
        const name = label("features", feature);
        const translated = value
          .split(",")
          .map((part) => label(`values.${feature}`, part))
          .join(" / ");
        const compact =
          /^(Animacy|Gender|Number|Case|Tense|VerbForm|Aspect|Voice|Mood|Polarity|Person)$/u.test(
            feature,
          );
        return (
          <Text
            variant="supporting"
            component="span"
            key={feature}
            inherit
            title={`${name}: ${translated}`}
          >
            {compact
              ? translated
              : value === "Yes"
                ? name
                : `${name}: ${translated}`}
            {index < entries.length - 1 && " ·"}
          </Text>
        );
      })}
    </Group>
  );
}

export function Grammar({ grammar }: { grammar: OccurrenceGrammar }) {
  const { sentence, group, tokenIds } = grammar;
  const selectedTokens = sentence.tokens.filter((token) =>
    tokenIds.includes(token.id),
  );
  const wordForms = selectedTokens.map((token) => {
    const head = sentence.tokens.find((part) => part.id === token.head);
    const verb = /^(VERB|AUX)$/u.test(token.upos);
    return (
      <Stack key={token.id}>
        <Text variant="supporting">
          {token.form} → {token.lemma}
          {!verb && ` · ${label("pos", token.upos)}`}
        </Text>
        {verb ? (
          <Text variant="supporting">
            {describeVerb(token.feats, token.upos)}
          </Text>
        ) : (
          <Features feats={token.feats} />
        )}
        <Text variant="supporting">
          {label("relations", token.deprel)}
          {head ? ` → ${head.form} (${head.lemma})` : ""}
        </Text>
      </Stack>
    );
  });
  return (
    <Stack data-srs-reader>
      {group && <Text variant="supporting">{describeVerb(group.feats)}</Text>}
      {wordForms}
    </Stack>
  );
}
