import { Box, Stack, Text } from "@mantine/core";
import { deckTree } from "@/srs/deck-tree";
import { useColorScheme } from "@mantine/hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { reviewAnswerMaxLength, type CardDocument } from "@/cards/model";
import { fieldText, renderCard, templateWarnings } from "@/cards/template";
import { loadCardAssets, requestedCardAsset } from "@/cards/sandbox/assets";
import type {
  CardFrameMessage,
  CardGesture,
  CardSelection,
} from "@/cards/sandbox/protocol";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { stopAudio } from "@/audio/playback";
import { AudioButton } from "@/audio/components/AudioButton";
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
  requestAsset = requestedCardAsset,
  wordAudio,
  deckName: previewDeckName,
  title = t("card_viewer_title"),
  onError,
  onLookup,
  onReady,
  onGesture,
  onSelectionChange,
  onAutoplayFallback,
}: {
  document: CardDocument;
  revealed: boolean;
  settings: Settings;
  loading?: boolean;
  loadAssets?: typeof loadCardAssets;
  requestAsset?: typeof requestedCardAsset;
  wordAudio?: "preview" | "toolbar";
  deckName?: string;
  title?: string;
  onError?: (message: string) => void;
  onLookup?: (text: string, point?: { x: number; y: number }) => void;
  onReady?: (cardId: string) => void;
  onGesture?: (gesture: CardGesture, progress?: number) => void;
  onSelectionChange?: (selection?: CardSelection) => void;
  onAutoplayFallback?: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({
    onError,
    onLookup,
    onReady,
    onGesture,
    onSelectionChange,
    onAutoplayFallback,
    requestAsset,
  });
  callbacks.current = {
    onError,
    onLookup,
    onReady,
    onGesture,
    onSelectionChange,
    onAutoplayFallback,
    requestAsset,
  };
  const [ready, setReady] = useState(false);
  const [displayed, setDisplayed] = useState<{
    cardId: string;
    revealed: boolean;
  }>();
  const [height, setHeight] = useState(180);
  const [message, setMessage] = useState<Omit<CardFrameMessage, "autoplay">>();
  const [recording, setRecording] = useState<Blob>();
  const renderId = useRef(0);
  const activeRender = useRef<
    | {
        id: number;
        revealed: boolean;
        autoplay: boolean;
      }
    | undefined
  >(undefined);
  const lastSide = useRef("");
  const [error, setError] = useState("");
  const system = useColorScheme();
  const dark =
    settings.theme === "system"
      ? system === "dark"
      : settings.theme === "dark" || settings.theme === "oled";
  const { card, note, noteType } = cardDocument;
  const allowAutoplay =
    !!onAutoplayFallback && (settings.autoplayFront || settings.autoplay);
  const autoplaySide =
    allowAutoplay && (revealed ? settings.autoplay : settings.autoplayFront);
  const audioIndex = noteType.bindings.wordAudio;
  const sound =
    wordAudio && audioIndex !== undefined
      ? note.fields[audioIndex]?.match(/\[sound:([^\]]+)\]/)
      : undefined;
  const audioTag =
    sound &&
    !note.fields.some(
      (field, index) => index !== audioIndex && field.includes(sound[0]),
    )
      ? sound[0]
      : undefined;
  const audioName = sound && fieldText(sound[1]!);
  const activeCard = useRef({ id: card.id, namespace: note.mediaNamespace });
  activeCard.current = { id: card.id, namespace: note.mediaNamespace };
  const warnings = useMemo(() => templateWarnings(noteType), [noteType]);
  const [deck, setDeck] = useState<{ id: string | null; name: string }>({
    id: null,
    name: "",
  });
  const deckName =
    previewDeckName ?? (deck.id === card.deckId ? deck.name : "");
  useEffect(() => {
    if (previewDeckName !== undefined) return;
    let cancelled = false;
    void (
      card.deckId
        ? db.decks.where("language").equals(card.language).toArray()
        : Promise.resolve([])
    ).then((decks) => {
      const name = deckTree(decks).find(
        (deck) => deck.id === card.deckId,
      )?.name;
      if (!cancelled) setDeck({ id: card.deckId, name: name || "" });
    });
    return () => {
      cancelled = true;
    };
  }, [card.deckId, card.language, previewDeckName]);
  const { html, templateError } = useMemo(() => {
    try {
      return {
        html: renderCard(cardDocument, revealed, {
          deckName,
          front: settings.front,
          showPartOfSpeech: settings.showPartOfSpeech,
          showGenderedArticle: settings.showGenderedArticle,
        }),
        templateError: "",
      };
    } catch (error) {
      return { html: "", templateError: (error as Error).message };
    }
  }, [
    cardDocument,
    revealed,
    deckName,
    settings.front,
    settings.showPartOfSpeech,
    settings.showGenderedArticle,
  ]);
  const scan = settings.scanPopups && !!onLookup;
  const selectionLimit = onSelectionChange ? reviewAnswerMaxLength : undefined;
  const dictionaryAssetsKey = JSON.stringify(
    cardDocument.study?.dictionaryAssets ?? null,
  );
  const gesture = onGesture ? (revealed ? "back" : "front") : undefined;
  useEffect(() => {
    activeRender.current = undefined;
    callbacks.current.onSelectionChange?.();
    const id = ++renderId.current;
    if (loading || (previewDeckName === undefined && deck.id !== card.deckId))
      return;
    let cancelled = false;
    setError("");
    setRecording(undefined);
    try {
      if (templateError) throw new Error(templateError);
      void loadAssets(
        note.mediaNamespace,
        html,
        noteType.css,
        undefined,
        (JSON.parse(dictionaryAssetsKey) as string[] | null) ?? undefined,
      )
        .then((assets) => {
          if (!cancelled) {
            const audio =
              audioTag && html.includes(audioTag)
                ? assets.find(
                    (asset) =>
                      asset.name === audioName &&
                      asset.mime.startsWith("audio/"),
                  )
                : undefined;
            if (wordAudio === "preview") setRecording(audio?.blob);
            setMessage({
              channel: "srs-card-render",
              cardId: card.id,
              renderId: id,
              ordinal: card.templateOrdinal,
              html: audio && audioTag ? html.replaceAll(audioTag, "") : html,
              css: noteType.css,
              assets,
              dark,
              language: note.language,
              scan,
              selectionLimit,
              gesture,
              theme: themeVariables() + dictionaryCss + mediaCss,
              hideSources: settings.hideDictionarySources,
              showPartOfSpeech: settings.showPartOfSpeech,
              audioLabel: t("play_audio"),
              videoLabel: t("play_video"),
              title,
              storage: readCardStorage(note.mediaNamespace),
              resourceError: t("card_media_unavailable"),
              reviewBindings: settings.reviewBindings,
            });
          }
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
    audioTag,
    audioName,
    wordAudio,
    loading,
    loadAssets,
    templateError,
    card.id,
    card.schedule?.reps,
    card.templateOrdinal,
    note.mediaNamespace,
    note.language,
    noteType.css,
    dictionaryAssetsKey,
    revealed,
    deckName,
    deck.id,
    previewDeckName,
    title,
    card.deckId,
    settings.front,
    settings.showPartOfSpeech,
    settings.scanPopups,
    settings.hideDictionarySources,
    settings.accentColor,
    settings.theme,
    settings.interfaceLanguage,
    settings.nativeLanguage,
    settings.reviewBindings,
    dark,
    scan,
    selectionLimit,
    gesture,
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
        type !== "ready" &&
        (!activeRender.current ||
          event.data.cardId !== activeCard.current.id ||
          event.data.renderId !== activeRender.current.id)
      )
        return;
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
        const render = activeRender.current;
        const source = event.source as Window;
        void callbacks.current
          .requestAsset(active.namespace, value.name)
          .then((blob) => {
            if (
              activeRender.current !== render ||
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
              activeRender.current === render &&
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
        if (
          activeRender.current?.revealed
            ? value.gesture === "again" || value.gesture === "good"
            : value.gesture === "reveal"
        ) {
          const progress = value.progress;
          if (
            progress === undefined ||
            (typeof progress === "number" && progress >= 0 && progress <= 1)
          )
            callbacks.current.onGesture?.(value.gesture, progress);
          return;
        }
        const input = reviewInputSchema.safeParse(value);
        if (input.success)
          document.body.dispatchEvent(
            input.data.type === "mouse"
              ? new MouseEvent("mousedown", { ...input.data, bubbles: true })
              : new KeyboardEvent("keydown", { ...input.data, bubbles: true }),
          );
      } else if (type === "selection") {
        if (value === null) callbacks.current.onSelectionChange?.();
        else if (
          typeof value?.text === "string" &&
          Number.isFinite(value.x) &&
          Number.isFinite(value.y)
        ) {
          const rect = frame.current!.getBoundingClientRect();
          callbacks.current.onSelectionChange?.({
            text: value.text.slice(0, reviewAnswerMaxLength + 1).trim(),
            x: Math.max(0, Math.min(innerWidth, rect.left + value.x)),
            y: Math.max(0, Math.min(innerHeight, rect.top + value.y)),
          });
        }
      } else if (type === "ready") setReady(true);
      else if (
        type === "rendered" &&
        value?.cardId === activeCard.current.id &&
        activeRender.current &&
        value?.renderId === activeRender.current.id
      ) {
        setDisplayed({
          cardId: value.cardId,
          revealed: activeRender.current.revealed,
        });
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
      } else if (
        type === "autoplayFallback" &&
        activeRender.current?.autoplay
      ) {
        activeRender.current.autoplay = false;
        callbacks.current.onAutoplayFallback?.();
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
    if (
      ready &&
      message &&
      !loading &&
      message.cardId === card.id &&
      message.renderId === renderId.current
    ) {
      const side = JSON.stringify([card.id, card.schedule?.reps, revealed]);
      const autoplay = autoplaySide && lastSide.current !== side;
      lastSide.current = side;
      activeRender.current = { id: message.renderId, revealed, autoplay };
      frame.current?.contentWindow?.postMessage({ ...message, autoplay }, "*");
    }
  }, [
    ready,
    message,
    loading,
    card.id,
    card.schedule?.reps,
    revealed,
    autoplaySide,
  ]);
  return (
    <Stack gap="xs" data-srs-reader>
      <ErrorBox error={error} />
      {recording && message?.cardId === card.id && (
        <AudioButton
          recording={recording}
          settings={settings}
          onError={setError}
        />
      )}
      {!!warnings.length && (
        <Text variant="supporting">
          {t("card_template_unsupported", { filters: warnings.join(", ") })}
        </Text>
      )}
      <Box
        pos="relative"
        mih={height}
        aria-busy={
          loading ||
          displayed?.cardId !== card.id ||
          displayed?.revealed !== revealed
        }
      >
        <Box
          component="iframe"
          ref={frame}
          src={browser.runtime.getURL("/card-viewer.html")}
          title={title}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          allow={allowAutoplay ? "autoplay *" : undefined}
          w="100%"
          bg="var(--mantine-color-body)"
          h={height}
          miw={0}
          style={{
            border: 0,
            display: "block",
            visibility:
              displayed?.cardId === card.id && (!displayed.revealed || revealed)
                ? "visible"
                : "hidden",
          }}
        />
      </Box>
    </Stack>
  );
}
