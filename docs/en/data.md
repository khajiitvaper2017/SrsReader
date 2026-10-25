# Backups & privacy

## Export and restore

Open **Settings → Backups**:

- **Full backup → Export full backup:** one ZIP containing settings, vocabulary and personal definitions, decks, saved sentences and translations, review history and scheduling state, recordings, installed dictionaries and their media and original archives, frequency and immersion data, word-form tables, Tatoeba corpora, online lookup and UDPipe caches, saved RWKV state, and downloaded RWKV and Bergamot model files.
- **Settings → Export JSON:** languages, controls, appearance, review settings, and dictionary ordering.
- **Words & progress → Export ZIP:** words, definitions, decks, cached sentences and translations, review history, mastered states, downloaded recordings, and live immersion dictionaries with hit counts, multipliers, and counted-block history.

You can also use **Settings → Dictionaries → Export ZIP** to export one original dictionary or an Immersion Frequency rank snapshot.

For a complete move to another browser, use **Import full backup**. Keep the page open while exporting or importing. A full import validates the archive in a temporary database before asking for confirmation. It replaces all local app data and downloaded model caches; it does not merge. If validation fails or you cancel, current data stays unchanged. Database writes are committed together, and a restore failure rolls back data and model-cache changes. The backup must use the same database format version as the installed extension. Export or restore after any running dictionary or language-data import finishes.

Browser permissions, browser-managed translation and detection models, open tabs, current review sessions, and unfinished import jobs are not transferred. Re-enable browser permissions where needed. Extension files are supplied by the installed extension. Full backups need temporary free space while being validated and restored.

Import a settings JSON or learning ZIP into its matching section to replace only that category. Existing category exports still work. Dictionaries may be imported before or after settings, and saved cards can be reviewed without their original dictionaries. Learning-only imports do not include word-form tables, Tatoeba corpora, parser or online lookup caches, or model files and states. After a learning-only restore, RWKV downloads its model if needed and rebuilds its state from review history. Undone answers remain in the history but do not affect scheduling.

Immersion hit counts and text fingerprints are included in learning and full backups. Fingerprints identify counted text without storing another copy of the page. Full backups also include cached analyzed page text and saved sentences; keep backup files private when they contain personal reading material.

Export before uninstalling, clearing browser data, or moving to another browser. There is no account or cloud backup.

## What stays local

Local parsing, reviews, and translation run on your device. Optional UDPipe analysis sends page text in supported studied languages to LINDAT. LINDAT may use that text to improve its systems. Page URLs are not added to these requests. Successful analyses stay cached in this browser until extension data is cleared. The parser cache is included in full backups, but not in settings or learning-only exports. Downloads contact dictionary publishers, Tatoeba, word-form and translation-model providers, and GitHub for the RWKV model. Optional pronunciation downloads send the word to Wikimedia Commons, LanguagePod101, or Forvo. These requests do not include your sentences or website URLs. Opening **Audio sources** also sends the word to enabled providers. Disable a provider under **Settings → Audio & translation → Pronunciation → Audio sources** to stop requests to it.

## Sources

Dictionaries come from [Wiktionary/Kaikki via wty](https://yomidevs.github.io/wiktionary-to-yomitan/download/); word forms from [Simplemma](https://github.com/adbar/simplemma); examples from [Tatoeba](https://tatoeba.org/en/downloads), under [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/). Local translation uses the browser’s Translator API or [Bergamot](https://github.com/browsermt/bergamot-translator).

Keep dictionary attribution and recording credits when sharing exports. Each source’s license still applies.
