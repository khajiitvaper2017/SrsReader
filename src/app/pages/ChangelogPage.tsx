import { Anchor, Typography } from "@mantine/core";
import Markdown from "react-markdown";
import changelog from "../../../CHANGELOG.md?raw";
import { t } from "@/shared/i18n/i18n";
import { PageHeader } from "@/shared/ui/PageHeader";

export function ChangelogPage() {
  return (
    <>
      <PageHeader title={t("changelog")} />
      <Typography component="article">
        <Markdown
          components={{
            h1: () => null,
            a: ({ href, children }) => (
              <Anchor href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </Anchor>
            ),
          }}
        >
          {changelog}
        </Markdown>
      </Typography>
    </>
  );
}
