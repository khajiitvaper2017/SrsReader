import { Group, Text, ThemeIcon } from "@mantine/core";
import { BookOpen } from "lucide-react";
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <ThemeIcon size={small ? 26 : 32} variant="light">
        <BookOpen size={18} />
      </ThemeIcon>
      <Text fw={700} size={small ? "sm" : "md"}>
        Srs
        <Text span inherit c="dimmed">
          Reader
        </Text>
      </Text>
    </Group>
  );
}
