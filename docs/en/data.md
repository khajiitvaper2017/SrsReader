# Backups & privacy

## Export and restore

Open **Settings → Data**:

- **Full backup → Export full backup:** one ZIP containing settings, vocabulary and personal definitions, decks, saved sentences and translations, review history and scheduling state, recordings, installed dictionaries and their media and original archives, frequency data, word-form tables, Tatoeba corpora, online lookup and UDPipe caches, saved RWKV state, and downloaded RWKV and Bergamot model files.
- **Settings → Export JSON:** languages, controls, appearance, review settings, and dictionary ordering.
- **Words & progress → Export ZIP:** words, definitions, decks, cached sentences and translations, review history, mastered states, and downloaded recordings.

You can also use **Settings → Dictionaries → Export ZIP** to export an original dictionary.

For a complete move to another browser, use **Import full backup**. Keep the page open while exporting or importing. A full import validates the archive in a temporary database before asking for confirmation. It replaces all local app data and downloaded model caches; it does not merge. If validation fails or you cancel, current data stays unchanged. Database writes are committed together, and a restore failure rolls back data and model-cache changes. The backup must use the same database format version as the installed extension. Export or restore after any running dictionary or language-data import finishes.

Browser permissions, browser-managed translation and detection models, open tabs, current review sessions, and unfinished import jobs are not transferred. Re-enable browser permissions where needed. Extension files are supplied by the installed extension. Full backups need temporary free space while being validated and restored.

Import a settings JSON or learning ZIP into its matching section to replace only that category. Existing category exports still work. Dictionaries may be imported before or after settings, and saved cards can be reviewed without their original dictionaries. Learning-only imports do not include word-form tables, Tatoeba corpora, parser or online lookup caches, or model files and states. After a learning-only restore, RWKV downloads its model if needed and rebuilds its state from review history. Undone answers remain in the history but do not affect scheduling.

Full backups include cached analyzed page text and saved sentences. Keep backup files private when they contain personal reading material.

Export before uninstalling, clearing browser data, or moving to another browser. There is no account or cloud backup.

## Browser storage

Open **Settings → Data** to see **Storage used**. This is the browser’s estimate for the extension’s database and cached offline models, including installed dictionaries, media, and learning data. It refreshes when you open the page, after backup or cleanup operations, and when app data changes. The browser may round the value. It does not include the installed extension files or models managed by the browser.

## Database cleanup

Use **Settings → Data → Clean up** to remove unused dictionary revisions left by interrupted or failed imports and updates. Cleanup checks entries, lookup indexes, frequency and phrase records, tags, media, and original archives. It keeps every installed dictionary, including disabled dictionaries, and preserves your vocabulary, review history, recordings, settings, corpora, and model downloads. The result reports how many unused records were removed, or tells you that none were found.

Cleanup is unavailable while an import is running. Imports also use the same cleanup before starting. If an earlier import was interrupted, you can clean up before exporting a full backup so it does not include those leftovers.

## What stays local

Local parsing, reviews, and translation run on your device. Optional UDPipe analysis sends page text in supported studied languages to LINDAT. LINDAT may use that text to improve its systems. Page URLs are not added to these requests. Successful analyses stay cached in this browser until extension data is cleared. The parser cache is included in full backups, but not in settings or learning-only exports. Downloads contact dictionary publishers, Tatoeba, word-form and translation-model providers, and GitHub for the RWKV model. Optional pronunciation downloads send the word to Wikimedia Commons, LanguagePod101, or Forvo. These requests do not include your sentences or website URLs. Opening **Audio sources** also sends the word to enabled providers. Disable a provider under **Settings → Audio & translation → Pronunciation → Audio sources** to stop requests to it.

## Sources

Source credits and license links are beside the parser controls in **Settings → Reading** and in each data-download section under **Settings → Dictionaries**. Local translation uses the browser’s Translator API or [Bergamot](https://github.com/browsermt/bergamot-translator).

Keep dictionary attribution and recording credits when sharing exports. Each source’s license still applies.
