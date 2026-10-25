import { languageName } from "@/languages/codes";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import {
  getTranslationModelPrompt,
  subscribeTranslationModel,
} from "@/translation/translate";
import { Button, Modal, Stack, Text } from "@mantine/core";
import { useState, useSyncExternalStore } from "react";

export function TranslationModelPrompt() {
  const prompt = useSyncExternalStore(
    subscribeTranslationModel,
    getTranslationModelPrompt,
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  function skip() {
    if (busy) return;
    setError("");
    setStatus("");
    prompt?.skip();
  }
  async function enable() {
    if (!prompt) return;
    setBusy(true);
    setError("");
    setStatus(t("downloading_translation_model"));
    try {
      await prompt.enable(setStatus);
      setStatus("");
    } catch (error) {
      console.warn("[translation] browser setup failed", error);
      setError(t("browser_translation_setup_failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      opened={!!prompt}
      onClose={skip}
      title={t("browser_translation_setup")}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
      centered
      data-srs-reader
    >
      {prompt && (
        <Stack>
          <Text variant="supporting">
            {t("browser_translation_setup_help", {
              source: languageName(prompt.sourceLanguage),
              target: languageName(prompt.targetLanguage),
            })}
          </Text>
          <ErrorBox error={error} />
          {busy && (
            <Text variant="supporting" role="status" aria-live="polite">
              {status}
            </Text>
          )}
          <Button data-autofocus loading={busy} onClick={() => void enable()}>
            {t("enable_browser_translation")}
          </Button>
          <Button variant="default" disabled={busy} onClick={skip}>
            {t("use_bergamot")}
          </Button>
        </Stack>
      )}
    </Modal>
  );
}
