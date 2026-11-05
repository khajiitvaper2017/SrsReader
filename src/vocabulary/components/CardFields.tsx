import { Stack, Text, Title } from "@mantine/core";
import type { WordWithCards } from "@/vocabulary/model";

export function CardFields({
  fields,
}: {
  fields: WordWithCards["customFields"];
}) {
  if (!fields?.length) return null;
  return (
    <Stack gap="xs" data-srs-reader>
      {fields.map((field, index) => (
        <Stack key={index} gap={0}>
          <Title order={4} style={{ overflowWrap: "anywhere" }}>
            {field.name}
          </Title>
          <Text style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {field.value}
          </Text>
        </Stack>
      ))}
    </Stack>
  );
}
