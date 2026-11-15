import { ActionIcon, Group, Title } from "@mantine/core";
import { ArrowLeft, Menu } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { t } from "@/shared/i18n/i18n";

export const PageHeaderContext = createContext<{
  target: HTMLElement | null;
  openNavigation?: () => void;
}>({ target: null });

export function PageHeader({
  title,
  actions,
  back,
}: {
  title: string;
  actions?: ReactNode;
  back?: { label: string; onClick: () => void };
}) {
  const { target, openNavigation } = useContext(PageHeaderContext);
  if (!target) return null;
  return createPortal(
    <Group h="100%" gap={0} wrap="nowrap" data-page-header>
      {back ? (
        <ActionIcon
          size="xl"
          ml="-sm"
          mr="xs"
          aria-label={back.label}
          title={back.label}
          onClick={back.onClick}
        >
          <ArrowLeft aria-hidden size={24} />
        </ActionIcon>
      ) : openNavigation ? (
        <ActionIcon
          size="xl"
          ml="-sm"
          mr="xs"
          data-navigation-trigger
          hiddenFrom="md"
          aria-label={t("pages")}
          onClick={openNavigation}
        >
          <Menu aria-hidden size={24} />
        </ActionIcon>
      ) : null}
      <Title
        order={1}
        title={title}
        flex={1}
        miw={0}
        mr="xs"
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </Title>
      {actions && (
        <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
          {actions}
        </Group>
      )}
    </Group>,
    target,
  );
}
