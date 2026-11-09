import { Box, Group, Text, ThemeIcon } from "@mantine/core";
import bookBrain from "./book-brain.svg";
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <Group wrap="nowrap">
      <ThemeIcon size={small ? 26 : 32} variant="transparent">
        <Box
          component="span"
          aria-hidden="true"
          w={small ? 24 : 28}
          h={small ? 24 : 28}
          bg="currentColor"
          style={{ mask: `url("${bookBrain}") center / contain no-repeat` }}
        />
      </ThemeIcon>
      <Text fw={700}>
        Srs
        <Text span inherit>
          Reader
        </Text>
      </Text>
    </Group>
  );
}
