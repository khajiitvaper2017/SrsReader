import { Group, Text, ThemeIcon } from "@mantine/core";
import { BookOpen } from "lucide-react";
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <Group wrap="nowrap">
      <ThemeIcon size={small ? 26 : 32} variant="light">
        <BookOpen size={18} />
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
