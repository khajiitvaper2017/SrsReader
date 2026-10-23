import {
  Accordion,
  Badge,
  Checkbox,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDictionaryTags } from "@/dictionaries/hooks/useDictionaryTags";
import type { Dictionary } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
export function DictionaryTags({
  dictionaries,
  settings,
  onChange,
}: {
  dictionaries: Dictionary[];
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const { search, setSearch, error, entries } = useDictionaryTags({
    dictionaries,
    settings,
    onChange,
  });
  return (
    <Accordion>
      <Accordion.Item value="settings">
        <Accordion.Control>{t("dictionary_tags")}</Accordion.Control>
        <Accordion.Panel>
          <Stack>
            <Text variant="supporting">{t("dictionary_tags_help")}</Text>
            <ErrorBox error={error} />
            <TextInput
              type="search"
              aria-label={t("search_dictionary_tags")}
              placeholder={t("search_dictionary_tags")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Stack mah={240} style={{ overflowY: "auto" }}>
              {entries.map(({ name, description }) => (
                <Checkbox
                  key={name}
                  label={<Badge>{name}</Badge>}
                  description={description !== name ? description : undefined}
                  aria-label={name}
                  checked={settings.ignoredTags.includes(name)}
                  onChange={(event) =>
                    onChange({
                      ignoredTags: event.target.checked
                        ? [...settings.ignoredTags, name]
                        : settings.ignoredTags.filter((tag) => tag !== name),
                    })
                  }
                />
              ))}
              {!entries.length && (
                <Text variant="supporting">{t("no_matching_tags")}</Text>
              )}
            </Stack>
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
