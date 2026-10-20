import { Text } from "@mantine/core";
import { useDictionaryImage } from "@/dictionaries/hooks/useDictionaryImage";
import { t } from "@/shared/i18n/i18n";
export function ImageContent({
  path,
  dictionaryId,
  alt,
  width,
  height,
}: {
  path: string;
  dictionaryId: string;
  alt?: string;
  width?: number;
  height?: number;
}) {
  const { url } = useDictionaryImage({
    path,
    dictionaryId,
    alt,
    width,
    height,
  });
  return url ? (
    <img
      src={url}
      alt={alt || ""}
      width={width}
      height={height}
      loading="lazy"
    />
  ) : (
    <Text component="span" inherit c="dimmed">
      {alt || t("image_unavailable")}
    </Text>
  );
}
