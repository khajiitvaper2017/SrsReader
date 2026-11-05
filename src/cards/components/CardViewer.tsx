import { Box, Stack, Text } from "@mantine/core";
import { useColorScheme } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import type { CardDocument } from "@/cards/model";
import { renderCard, templateWarnings } from "@/cards/template";
import { loadCardAssets, requestedCardAsset } from "@/cards/sandbox/assets";
import type { CardFrameMessage } from "@/cards/sandbox/protocol";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { stopAudio } from "@/audio/playback";
import { readCardStorage, writeCardStorage } from "@/cards/sandbox/storage";
import { reviewInputSchema } from "@/srs/controls";
import dictionaryCss from "@/shared/styles/dictionary.css?inline";
import mediaCss from "@/cards/sandbox/media.css?inline";

function themeVariables() {
  const style = getComputedStyle(document.documentElement);
  const names = [
    "font-family",
    "color-text",
    "color-body",
    "color-dimmed",
    "color-default-border",
    "color-anchor",
    "color-violet-text",
    "color-violet-light",
    "primary-color-filled",
    "primary-color-light",
    "primary-color-light-hover",
    "primary-color-light-color",
    "spacing-xs",
    "spacing-sm",
    "spacing-md",
    "radius-default",
    "font-size-md",
    "font-size-xs",
  ];
  return `:root{${names.map((name) => `--mantine-${name}:${style.getPropertyValue(`--mantine-${name}`)}`).join(";")}}`;
}

export function CardViewer({
  document: cardDocument,
  revealed,
  settings,
  loading = false,
  loadAssets = loadCardAssets,
  onError,
  onLookup,
  onReady,
}: {
  document: CardDocument;
  revealed: boolean;
  settings: Settings;
  loading?: boolean;
  loadAssets?: typeof loadCardAssets;
  onError?: (message: string) => void;
  onLookup?: (text: string, point?: { x: number; y: number }) => void;
  onReady?: (cardId: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onError, onLookup, onReady });
  callbacks.current = { onError, onLookup, onReady };
  const [ready, setReady] = useState(false);
  const [displayedCard, setDisplayedCard] = useState("");
  const [height, setHeight] = useState(180);
  const [message, setMessage] = useState<CardFrameMessage>();
  const [error, setError] = useState("");
  const system = useColorScheme();
  const dark =
    settings.theme === "system"
      ? system === "dark"
      : settings.theme === "dark" || settings.theme === "oled";
  const { card, note, noteType } = cardDocument;
  const activeCard = useRef({ id: card.id, namespace: note.mediaNamespace });
  activeCard.current = { id: card.id, namespace: note.mediaNamespace };
  const warnings = templateWarnings(noteType);
  const [deck, setDeck] = useState<{ id: string | null; name: string }>({
    id: null,
    name: "",
  });
  const deckName = deck.id === card.deckId ? deck.name : "";
  useEffect(() => {
    let cancelled = false;
    void (
      card.deckId ? db.decks.get(card.deckId) : Promise.resolve(undefined)
    ).then((deck) => {
      if (!cancelled) setDeck({ id: card.deckId, name: deck?.name || "" });
    });
    return () => {
      cancelled = true;
    };
  }, [card.deckId]);
  let html = "";
  let templateError = "";
  try {
    html = renderCard(cardDocument, revealed, {
      deckName,
      front: settings.front,
      showPartOfSpeech: settings.showPartOfSpeech,
    });
  } catch (error) {
    templateError = (error as Error).message;
  }
  const scan = settings.scanPopups && !!onLookup;
  useEffect(() => {
    if (loading || deck.id !== card.deckId) return;
    let cancelled = false;
    setError("");
    try {
      if (templateError) throw new Error(templateError);
      void loadAssets(note.mediaNamespace, html, noteType.css)
        .then((assets) => {
          if (!cancelled)
            setMessage({
              channel: "srs-card-render",
              cardId: card.id,
              ordinal: card.templateOrdinal,
              html,
              css: noteType.css,
              assets,
              dark,
              language: note.language,
              scan,
              theme: themeVariables() + dictionaryCss + mediaCss,
              hideSources: settings.hideDictionarySources,
              showPartOfSpeech: settings.showPartOfSpeech,
              autoplay: revealed && settings.autoplay,
              audioLabel: t("play_audio"),
              videoLabel: t("play_video"),
              title: t("card_viewer_title"),
              storage: readCardStorage(note.mediaNamespace),
              resourceError: t("card_media_unavailable"),
              reviewBindings: settings.reviewBindings,
            });
        })
        .catch((error: Error) => {
          if (!cancelled) {
            setError(error.message);
            callbacks.current.onError?.(error.message);
          }
        });
    } catch (error) {
      const message = (error as Error).message;
      setError(message);
      callbacks.current.onError?.(message);
    }
    return () => {
      cancelled = true;
    };
  }, [
    html,
    loading,
    loadAssets,
    templateError,
    card.id,
    card.templateOrdinal,
    note.mediaNamespace,
    note.language,
    noteType.css,
    revealed,
    deckName,
    deck.id,
    card.deckId,
    settings.front,
    settings.showPartOfSpeech,
    settings.scanPopups,
    settings.hideDictionarySources,
    settings.accentColor,
    settings.autoplay,
    settings.theme,
    settings.interfaceLanguage,
    settings.nativeLanguage,
    settings.reviewBindings,
    dark,
    scan,
  ]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== "srs-card-frame"
      )
        return;
      const { type, value } = event.data;
      if (
        type === "asset" &&
        value?.cardId === activeCard.current.id &&
        typeof value.requestId === "string" &&
        value.requestId.length <= 100 &&
        typeof value.name === "string" &&
        value.name.length <= 4096 &&
        !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(value.name)
      ) {
        const active = activeCard.current;
        const source = event.source as Window;
        void requestedCardAsset(active.namespace, value.name)
          .then((blob) => {
            if (
              activeCard.current.id !== active.id ||
              activeCard.current.namespace !== active.namespace ||
              frame.current?.contentWindow !== source
            )
              return;
            source.postMessage(
              {
                channel: "srs-card-asset",
                cardId: active.id,
                requestId: value.requestId,
                blob,
                error: blob
                  ? undefined
                  : t("card_asset_unavailable", { name: value.name }),
              },
              "*",
            );
          })
          .catch(() => {
            if (
              activeCard.current.id === active.id &&
              frame.current?.contentWindow === source
            )
              source.postMessage(
                {
                  channel: "srs-card-asset",
                  cardId: active.id,
                  requestId: value.requestId,
                  error: t("card_asset_unavailable", { name: value.name }),
                },
                "*",
              );
          });
      } else if (type === "input" && value?.cardId === activeCard.current.id) {
        const input = reviewInputSchema.safeParse(value);
        if (input.success)
          document.body.dispatchEvent(
            input.data.type === "mouse"
              ? new MouseEvent("mousedown", { ...input.data, bubbles: true })
              : new KeyboardEvent("keydown", { ...input.data, bubbles: true }),
          );
      } else if (type === "ready") setReady(true);
      else if (type === "rendered" && value?.cardId === activeCard.current.id) {
        setDisplayedCard(value.cardId);
        callbacks.current.onReady?.(value.cardId);
      } else if (
        type === "storage" &&
        value?.cardId === activeCard.current.id
      ) {
        try {
          writeCardStorage(activeCard.current.namespace, value);
        } catch {
          const message = t("card_storage_unavailable");
          setError(message);
          callbacks.current.onError?.(message);
        }
      } else if (
        type === "storageError" &&
        value?.cardId === activeCard.current.id
      ) {
        const message = t("card_storage_unavailable");
        setError(message);
        callbacks.current.onError?.(message);
      } else if (type === "audioStarted") stopAudio(false);
      else if (
        type === "height" &&
        typeof value === "number" &&
        Number.isFinite(value)
      )
        setHeight(Math.min(10000, Math.max(80, value)));
      else if (type === "error" && typeof value === "string") {
        setError(value.slice(0, 1000));
        callbacks.current.onError?.(value.slice(0, 1000));
      } else if (
        type === "lookup" &&
        value?.cardId === activeCard.current.id &&
        typeof value.text === "string"
      ) {
        const rect = frame.current!.getBoundingClientRect();
        callbacks.current.onLookup?.(value.text.slice(0, 256), {
          x: rect.left + (Number(value.x) || 0),
          y: rect.top + (Number(value.y) || 0),
        });
      }
    }
    window.addEventListener("message", receive);
    const stop = () =>
      frame.current?.contentWindow?.postMessage(
        { channel: "srs-card-stop" },
        "*",
      );
    window.addEventListener("srs-reader-stop-audio", stop);
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("srs-reader-stop-audio", stop);
    };
  }, []);
  useEffect(() => {
    if (ready && message)
      frame.current?.contentWindow?.postMessage(message, "*");
  }, [ready, message]);
  return (
    <Stack gap="xs" data-srs-reader>
      <ErrorBox error={error} />
      {!!warnings.length && (
        <Text variant="supporting">
          {t("card_template_unsupported", { filters: warnings.join(", ") })}
        </Text>
      )}
      <Box pos="relative" mih={height} aria-busy={displayedCard !== card.id}>
        <Box
          component="iframe"
          ref={frame}
          src={browser.runtime.getURL("/card-viewer.html")}
          title={t("card_viewer_title")}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          w="100%"
          bg="var(--mantine-color-body)"
          h={height}
          miw={0}
          style={{
            border: 0,
            display: "block",
            visibility: displayedCard ? "visible" : "hidden",
          }}
        />
      </Box>
    </Stack>
  );
}
