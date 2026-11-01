import { Anchor, Text } from "@mantine/core";
import { Trans } from "react-i18next";
import { i18n } from "@/shared/i18n/i18n";

/** Source and license credits for a provider's settings or download section. */
export function SourceAttribution({
  i18nKey,
  links,
}: {
  i18nKey: string;
  links: Record<string, string>;
}) {
  return (
    <Text variant="supporting">
      <Trans
        i18n={i18n}
        i18nKey={i18nKey}
        components={Object.fromEntries(
          Object.entries(links).map(([name, href]) => [
            name,
            <Anchor
              key={name}
              inherit
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            />,
          ]),
        )}
      />
    </Text>
  );
}
