import Markdown from "react-markdown";
import { useEffect } from "react";
import { i18n, t } from "./i18n";

const guides = import.meta.glob<string>("../docs/*/*.md", {
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
  useEffect(() => window.scrollTo(0, 0), [selected.id]);
  return (
    <div className="docs-layout">
      <nav className="docs-topics" aria-label={t("docs_topics")}>
        {topics.map((item) => (
          <a
            key={item.id}
            href={`#docs/${item.id}`}
            aria-current={item === selected ? "page" : undefined}
          >
            {t(item.label)}
          </a>
        ))}
      </nav>
      <article
        className="docs-content"
        lang={language}
        key={`${language}:${selected.id}`}
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
                <a
                  href={linkedTopic ? `#docs/${linkedTopic.id}` : href}
                  title={title}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {guides[`../docs/${language}/${selected.id}.md`]}
        </Markdown>
      </article>
    </div>
  );
}
