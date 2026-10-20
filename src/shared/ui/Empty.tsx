import { Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Stack align="center" ta="center" gap="sm" py="xl">
      <Title order={2}>{title}</Title>
      <Text component="div" c="dimmed">
        {children}
      </Text>
    </Stack>
  );
}
