import {
  Anchor,
  Box,
  Button,
  Container,
  Flex,
  Group,
  Image,
  MantineProvider,
  Stack,
  Text,
  Title,
  Typography,
} from "@mantine/core";
import { Code } from "lucide-react";
import Markdown from "react-markdown";
import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import changelog from "../../CHANGELOG.md?raw";
import privacy from "../../PRIVACY.md?raw";
import terms from "../../TERMS.md?raw";
import icon from "../../public/icons/128.png";
import { Home, githubUrl } from "./Home";
import { theme } from "./theme";

const articles = {
  "/privacy": { name: "Privacy policy", content: privacy },
  "/terms": { name: "Terms of service", content: terms },
  "/changelog": { name: "Changelog", content: changelog },
};

export const paths = ["/", ...Object.keys(articles)];

function articleFor(path: string) {
  return articles[path as keyof typeof articles];
}

export function titleFor(path: string) {
  const article = articleFor(path);
  if (article) return `${article.name} | SrsReader`;
  return path === "/" ? "SrsReader" : "Page not found | SrsReader";
}

export function App() {
  const [location] = useLocation();
  const path = location.replace(/\/$/, "") || "/";
  const article = articleFor(path);
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(path);

  useEffect(() => {
    document.title = titleFor(path);
    if (previousPath.current !== path) {
      previousPath.current = path;
      main.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [path]);

  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Flex direction="column" mih="100svh">
        <Box
          component="header"
          style={{
            borderBottom: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <Container size="lg">
            <Group justify="space-between" h={64} wrap="nowrap">
              <Anchor component={Link} href="/" c="inherit" underline="never">
                <Group gap="sm" wrap="nowrap">
                  <Image src={icon} w={32} h={32} alt="" />
                  <Text fw={700}>SrsReader</Text>
                </Group>
              </Anchor>
              <Button
                component="a"
                href={githubUrl}
                size="sm"
                leftSection={<Code size={16} aria-hidden="true" />}
              >
                GitHub
              </Button>
            </Group>
          </Container>
        </Box>

        <Box
          component="main"
          ref={main}
          tabIndex={-1}
          style={{ flex: 1, outline: "none" }}
        >
          <Container
            size={article ? "sm" : "lg"}
            py={{ base: "xl", sm: "3rem" }}
          >
            {article ? (
              <Typography style={{ overflowWrap: "anywhere" }}>
                <Markdown
                  components={{
                    a: ({ href, children }) =>
                      href === "PRIVACY.md" ? (
                        <Anchor
                          component={Link}
                          href="/privacy"
                          underline="always"
                        >
                          {children}
                        </Anchor>
                      ) : (
                        <Anchor href={href} underline="always">
                          {children}
                        </Anchor>
                      ),
                  }}
                >
                  {article.content}
                </Markdown>
              </Typography>
            ) : path === "/" ? (
              <Home />
            ) : (
              <Stack gap="sm">
                <Title order={1}>Page not found</Title>
                <Anchor component={Link} href="/">
                  Return to SrsReader
                </Anchor>
              </Stack>
            )}
          </Container>
        </Box>

        <Box
          component="footer"
          style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
        >
          <Container size="lg" py="md">
            <Group component="nav" aria-label="Footer" gap="lg">
              <Anchor
                component={Link}
                href="/privacy"
                aria-current={path === "/privacy" ? "page" : undefined}
                size="sm"
              >
                Privacy policy
              </Anchor>
              <Anchor
                component={Link}
                href="/terms"
                aria-current={path === "/terms" ? "page" : undefined}
                size="sm"
              >
                Terms of service
              </Anchor>
              <Anchor href={`${githubUrl}/issues`} size="sm">
                Support
              </Anchor>
              <Anchor
                component={Link}
                href="/changelog"
                aria-current={path === "/changelog" ? "page" : undefined}
                size="sm"
              >
                Changelog
              </Anchor>
            </Group>
          </Container>
        </Box>
      </Flex>
    </MantineProvider>
  );
}
