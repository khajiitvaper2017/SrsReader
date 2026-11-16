import { Group, Image, Text } from "@mantine/core";
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <Group wrap="nowrap">
      <Image
        src="/icons/48.png"
        alt=""
        w={small ? 26 : 32}
        h={small ? 26 : 32}
      />
      <Text fw={700}>
        Srs
        <Text span inherit>
          Reader
        </Text>
      </Text>
    </Group>
  );
}
