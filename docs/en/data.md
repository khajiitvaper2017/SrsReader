# Backups & privacy

## Export and restore

Open **Settings** and keep these exports:

- **Dictionaries → Export ZIP:** each original dictionary file.
- **Import & export → Settings → Export JSON:** languages, controls, appearance, review settings, and dictionary ordering.
- **Import & export → Words & progress → Export ZIP:** words, definitions, sentences, translations, review history, mastered states, and downloaded recordings.

Import each file into its matching section. Settings and learning imports replace that category after confirmation; they do not merge. Dictionaries may be imported before or after settings. Saved cards can be reviewed without their original dictionaries.

RWKV model files and saved model states are not included. After restore, RWKV downloads its model if needed and rebuilds its state from review history. Undone answers are included in the history but do not affect scheduling.

Word-form tables and Tatoeba corpora are not included in these exports. Download them again under **Settings → Dictionaries → Word forms** and **Example sentences** after moving to another browser.

Export before uninstalling, clearing browser data, or moving to another browser. There is no account or cloud backup.

## What stays local

Local parsing, reviews, and translation run on your device. Optional UDPipe analysis sends Czech page text to LINDAT. LINDAT may use that text to improve its systems. Page URLs are not added to these requests. Successful analyses stay cached in this browser until extension data is cleared. The parser cache is not included in exports. Downloads contact dictionary publishers, Tatoeba, word-form and translation-model providers, and GitHub for the RWKV model. Optional pronunciation downloads send the word to Wikimedia Commons, not your sentences or website URLs.

## Sources

Dictionaries come from [Wiktionary/Kaikki via wty](https://yomidevs.github.io/wiktionary-to-yomitan/download/); word forms from [Simplemma](https://github.com/adbar/simplemma); examples from [Tatoeba](https://tatoeba.org/en/downloads), under [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/). Local translation uses the browser’s Translator API or [Bergamot](https://github.com/browsermt/bergamot-translator).

Keep dictionary attribution and recording credits when sharing exports. Each source’s license still applies.
