import {
  Button,
  Divider,
  Flex,
  Grid,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { BookOpen, Bookmark, Puzzle, Repeat } from "lucide-react";
import { ScreenshotGallery } from "./ScreenshotGallery";

export const githubUrl = "https://github.com/khajiitvaper2017/SrsReader";
const extensionUrl =
  "https://chromewebstore.google.com/detail/srsreader/oephpfiglpdbghjnodbidmhikgdeoepl";

const features = [
  {
    title: "Look up words",
    description:
      "See definitions while you read with your installed dictionaries.",
    Icon: BookOpen,
  },
  {
    title: "Save words in context",
    description: "Keep useful words with the sentences where you found them.",
    Icon: Bookmark,
  },
  {
    title: "Review your vocabulary",
    description: "Practice saved words with spaced repetition.",
    Icon: Repeat,
  },
];

export function Home() {
  return (
    <Stack gap="xl">
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="md" maw={420}>
            <Title order={1}>Learn languages while you read</Title>
            <Text>
              SrsReader is a browser extension that brings dictionary lookups,
              saved vocabulary, and spaced repetition to the websites you read.
            </Text>
            <Group mt="xs">
              <Button
                component="a"
                href={extensionUrl}
                variant="filled"
                leftSection={<Puzzle size={18} aria-hidden="true" />}
              >
                Chrome Web Store
              </Button>
            </Group>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <ScreenshotGallery />
        </Grid.Col>
      </Grid>

      <Divider />

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xl">
        {features.map(({ title, description, Icon }) => (
          <Flex key={title} gap="sm" align="flex-start">
            <ThemeIcon variant="light" size="lg" style={{ flexShrink: 0 }}>
              <Icon size={18} aria-hidden="true" />
            </ThemeIcon>
            <Stack gap={4}>
              <Title order={2} size="h4">
                {title}
              </Title>
              <Text>{description}</Text>
            </Stack>
          </Flex>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
