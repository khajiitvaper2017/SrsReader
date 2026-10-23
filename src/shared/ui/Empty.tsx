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
    <Stack align="center" ta="center" py="xl">
      <Title order={2}>{title}</Title>
      <Text variant="supporting" component="div">
        {children}
      </Text>
    </Stack>
  );
}
