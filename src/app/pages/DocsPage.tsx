import { Anchor, Grid, NavLink, Paper, Typography } from "@mantine/core";
import { i18n, t } from "@/shared/i18n/i18n";
import { useEffect } from "react";
import Markdown from "react-markdown";
const guides = import.meta.glob<string>("../../../docs/*/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});
const topics = [
  { id: "getting-started", label: "docs_getting_started" },
  { id: "dictionaries", label: "docs_dictionaries" },
  { id: "reading", label: "docs_reading" },
  { id: "review", label: "docs_review" },
  { id: "data", label: "docs_data" },
];
export default function DocsPage({ topic }: { topic: string }) {
  const selected = topics.find((item) => item.id === topic) || topics[0]!;
  const language = i18n.resolvedLanguage === "uk" ? "uk" : "en";
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selected.id]);
  return (
    <Grid align="start">
      <Grid.Col span={{ base: 12, sm: 3 }}>
        <Paper p="xs" component="nav" aria-label={t("docs_topics")}>
          {topics.map((item) => (
            <NavLink
              key={item.id}
              href={`#docs/${item.id}`}
              active={item === selected}
              aria-current={item === selected ? "page" : undefined}
              label={t(item.label)}
            />
          ))}
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 9 }}>
        <Typography
          lang={language}
          key={`${language}:${selected.id}`}
          className="markdown-content"
        >
          <Markdown
            skipHtml
            components={{
              a({ href, children, title }) {
                const linkedTopic = topics.find(
                  (item) => href === `${item.id}.md`,
                );
                const external = href?.startsWith("https://");
                return (
                  <Anchor
                    href={linkedTopic ? `#docs/${linkedTopic.id}` : href}
                    title={title}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                  >
                    {children}
                  </Anchor>
                );
              },
            }}
          >
            {guides[`../../../docs/${language}/${selected.id}.md`]}
          </Markdown>
        </Typography>
      </Grid.Col>
    </Grid>
  );
}
