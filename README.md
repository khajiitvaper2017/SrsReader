# SrsReader

A local dictionary and spaced-repetition reader for desktop Chromium browsers and Firefox. Choose a study language and a native language; parsing, dictionaries, examples, pronunciation, and SRS use those choices.

## Install

Use Node.js 22 or newer.

```sh
npm install
npm run build
npm run build:firefox
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `.output/chrome-mv3`.

In Firefox, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `.output/firefox-mv3/manifest.json`. Temporary add-ons are removed when Firefox closes; keep exports of your learning data. A signed Firefox package is needed for a permanent installation in ordinary Firefox.

For development, use `npm run dev` or `npm run dev:firefox`. Create distribution ZIPs with `npm run zip` and `npm run zip:firefox`.

Run `npm run fix` to apply ESLint fixes and format the project with Prettier. Lint errors that cannot be fixed automatically are reported in the terminal. Use `npm run format` for formatting alone, or `npm run format:check` to check formatting without changing files. The project uses Prettier’s default style from `.prettierrc.json`.

## First setup

On first installation, a setup window opens. Choose your **Study language**, then confirm your **Native language**, suggested from your system/browser language. It is used for translations and, by default, the interface. Under **Settings → Languages → Interface language**, choose **English**, **українська**, or **Same as native language** (default). This selector is also available during setup. Other native languages use the English interface. Language names, dates, and numbers follow the interface language. Import a dictionary for your study language and choose one or more lookup controls. Nothing is selected for lookup by default. **Finish setup** is available once a dictionary and a lookup control are selected.

Finishing setup downloads Tatoeba examples for your study language when available and not already installed. You can import a detailed TSV or `.bz2` export under **Example sentences** before finishing setup instead.

Setup saves your choices as you go. You can return to it with **Settings → Open setup**.

## Dictionaries

Open **Settings → Dictionaries → Choose ZIP** and import a Yomitan format-3 term or frequency dictionary. You can also drag the ZIP into the import area. Keep Settings open until the import finishes.

Use **Settings → Languages** to choose your study and native languages. **Find dictionaries** opens a multilingual dictionary directory. The ZIPs in `dicts/` are test dictionaries and do not restrict which language you can study. You can install multiple dictionaries, change their order, and disable them individually.

Word forms follow dictionary references to their base words. Forms and their base word share a card and review history. When several base words are possible, choose the intended word in the dictionary popup. References whose targets have no definition remain unavailable until a dictionary supplies them.

If a Czech form has no dictionary entry, the reader also checks a bundled offline word-form table. A match opens the base word and uses its card. Existing dictionary entries and references take priority. The base word must still have an enabled dictionary definition; parsing cannot supply a missing meaning or turn a separate prefixed verb into its unprefixed verb.

Choose **Check updates** beside an installed dictionary to check its publisher’s update source. If an update is available, choose **Update** to install it. No update checks happen automatically. Dictionaries without update metadata can be replaced by importing a newer ZIP with the same title and languages.

### Frequency dictionaries

Open **Settings → Dictionaries → Frequency dictionaries** to browse [Leipzig to Yomitan](https://github.com/StefanVukovic99/leipzig-to-yomitan/releases/tag/v2024-08-31-18-57-16-00-00). Filter by language and corpus type, search for a corpus or region, and sort by language, type, or download size. **Import** downloads and installs the selected dictionary. The menu uses the Rank edition and assigns its language automatically. Browsing the catalog works offline; importing needs a connection.

You can also import a frequency ZIP with **Choose ZIP**. Select the correct **Language** first if the ZIP has no language metadata. A frequency dictionary supplies ranks, not definitions; keep a term dictionary installed for reading.

New cards use the harmonic mean of the base word’s ranks across all enabled frequency dictionaries for the selected language, from most common to least common. Dictionaries without a matching rank are left out. Dictionary order does not affect this combined rank. Already introduced cards keep their review schedule.

Under **Settings → Spaced repetition → Words without frequency**, choose **Introduce last** to place unranked words after ranked words, or **Assign random frequency** to mix them into the enabled dictionaries’ rank range. Random positions stay stable between reviews and exports. Without an enabled frequency dictionary, these options use the order words were saved or a stable random order, respectively.

## Read and save words

Open a website in your selected language and use your lookup control on a highlighted word. Press **Escape** or click outside the popup to close it.

Definitions are parsed too. Use the same lookup control on a word in a definition to open it. **Back** or **Escape** returns to the previous entry; the close button closes the popup. Turn this off with **Settings → Reading & appearance → Scan dictionary popups**.

Under **Settings → Reading & appearance → Word colors**, choose **Off**, **Text**, or **Background** and a color for each state. New words are words you have not saved; Saved words have not been reviewed yet. Learning includes relearning, Reviewing means the next review is in the future, and Due means a review is ready. Mastered words are green by default; suspended words have their own style. Unparsed covers words without a dictionary match. The same styles apply on websites and inside definitions. **Color words** switches all colors off without changing parsing or your saved styles; **Reset colors** restores the defaults.

The popup’s **Freq.** badge combines ranks from enabled frequency dictionaries for the word’s language. Hover for each dictionary’s rank, or click to expand the list. With several dictionaries, the badge shows their harmonic mean, rounded to a whole rank. Missing ranks are left out; without a matching rank, no badge appears. New-card ordering uses the same combined rank.

**Settings → Reading & appearance → Hide dictionary source links** hides links such as Wiktionary and Kaikki in lookup popups. It is on by default; turn it off to show them.

Configure lookup in **Settings → Lookup controls**. You can enable several bindings:

- **Middle mouse:** press the middle mouse button over a word.
- **Shift + hover:** hold Shift over a word. Pressing Shift while already pointing at a word also works.
- **Mouse Forward:** press the mouse’s forward side button over a word.
- **Hover:** open the popup without pressing anything.

For a custom binding, select **Mouse button**, **Keyboard shortcut**, or **Hold key + hover**, then choose **Record binding** and press the input you want. Modifiers such as Ctrl, Alt, Shift, and Meta are supported. Release modifier keys to finish recording a modifier-only hover binding. Escape cancels recording.

Mouse and keyboard bindings can also look up selected text. Some shortcuts are reserved by the browser or operating system and cannot be overridden.

Open **Settings → Lookup controls → Input action prevention** to block normal middle-click or Back/Forward button actions. Each button group has independent options for **Text hover**, **Webpages**, **Lookup popups**, **Extension pages** (Review, Words, Settings, and the toolbar), and **Search fields**. Text hover covers any text, including words missing from your dictionaries. Selecting a page option blocks actions across that page; selecting only Text hover or Search fields leaves other areas alone.

Prevention activates automatically for matching mouse lookup bindings, including their modifiers. A Middle mouse binding enables middle-click prevention; a Mouse Forward binding enables prevention for Forward alone. Shift + hover does not block mouse buttons. Prevention defaults to all page types and search fields; turn off locations where you want normal browser actions. Successful mouse lookups always block the button's browser action. On paused or disabled websites, mouse buttons keep their normal behavior.

Choose **Mine word** to save all meanings and the current sentence. Saving another example adds it to the same word. Choose **Again**, **Hard**, **Good**, or **Easy** to mine and review in one action, including a word you have never saved before. These buttons also review words before their scheduled due time. Opening a word alone does not count as a review.

Choose **Master** in a lookup popup, Review, or Words to keep a word out of SRS. You can still save examples without changing its mastered status. **Unmaster** in a popup or Words restores its previous schedule, or adds it as a new card if it has never been studied. Review history is preserved. Find these words with the **Mastered** filter in Words; change their color under **Settings → Reading & appearance → Word colors**.

The toolbar lets you pause all parsing or disable the current website. Browser-protected pages, image/canvas text, PDF viewers, and editable fields are not parsed.

**Settings → Reading & appearance → Only parse the reading language** is on by default. The reader skips text confidently detected as another language and still parses matching paragraphs on mixed-language pages. Short or uncertain text uses the surrounding page as a hint; uncertain pages remain readable. Turn this off to parse without language filtering. Chrome uses its Language Detector API when its model is ready, with the browser’s extension language detector as a fallback. Firefox uses its extension language detector. Detection runs locally.

## Sentence translation

Dictionary popups show a local [Tatoeba](https://tatoeba.org/en/downloads) example for the word when one is available. **Another example** cycles through matching sentences, including inflected forms. Click **Translate sentence** below an example for a local machine translation. Contributor credits link to the original Tatoeba sentence. These example sentences are separate from the sentence you are mining.

Click **Translate current sentence** to show a translation of the sentence you opened the popup from. It stays hidden until requested. **Mine word**, **Save example**, and the grading buttons save that original sentence and its translation, without replacing it with a Tatoeba example. You can also translate an example already saved in Words or shown on a Review answer.

Choose **Study language** and **Native language** under **Settings → Languages** or during first setup. Both lists show languages with localized names. Examples and parsing use the study language; sentence and definition translations use the native language. Chrome uses its Translator API when available. If it cannot translate the pair, or you use Firefox, SrsReader uses bundled [Bergamot](https://github.com/browsermt/bergamot-translator). Its supported languages are Bulgarian, Czech, English, Estonian, French, German, Italian, Portuguese, Russian, Spanish, and Ukrainian; pairs without a direct model translate through English. Language selection is independent of translation-model availability. A translation can only run when the browser or the local engine provides that language pair.

**Translate definition** appears below definitions in dictionaries whose source and definition languages match, such as `wty-cs-cs`. It translates the definition into your native language and leaves the original visible. Definitions already in another language do not have this button.

Translation models download on first use and are kept locally for offline use. Sentences are not sent to a translation service. Saved translations remain available without a model, retain their own language, and are included in learning exports. Editing an original sentence removes its old translation.

**Settings → Spaced repetition → Show sentence translations** is on by default. Translations appear with the original on the answer side, after **Show answer**. Turning it off hides translations during review without deleting them.

## Review

Open **Review** from the toolbar. Choose **Word** or **In context** to change the front of the card. **Show answer** or **Space** reveals the meanings and saved sentence. Grade with **Again** (key **1**) or **Good** (key **3**).

**Settings → Spaced repetition** contains:

- **Use only Again and Good:** on by default for lookup popups and Review. Turn it off to show Hard and Easy as well, with keys **1–4** from Again to Easy.
- **New words per day:** 0–10,000; default 20. Due reviews are unlimited. Reviews made while reading remain available after this limit.
- **Words without frequency:** Introduce last (default) or Assign random frequency.
- **Desired retention:** 70–99%; default 90%. Higher retention generally requires more reviews. Changes apply to future reviews.
- **Default card front:** Word only or Word in sentence. Word only is the default.

Scheduling uses ts-fsrs 5.4.2 / FSRS-6, with 1-minute and 10-minute learning steps and a 10-minute relearning step. **Undo last review** restores the previous state unless that word has subsequently changed.

Use **Words** to search, edit a saved definition or sentence, master or unmaster a word, suspend it, or delete it. **Refresh from dictionary** replaces a saved definition with the current dictionary definition. Dictionary updates do not automatically rewrite saved definitions.

## Audio

Use the speaker beside a word to play a saved recording or an installed local voice for the word’s language. The sentence speaker uses local system speech synthesis. Choose a voice under **Settings → Pronunciation**.

Enable **Download natural pronunciations** to fetch word recordings from Wikimedia Commons using Wiktionary and Lingua Libre sources. This is off by default. When enabled, playing or mining a word requests that word’s recording and saves it locally. Website URLs and sentences are not sent to the pronunciation service. Recording credits link to the source and remain in learning exports.

Sentence audio and the fallback word voice require a voice for the selected language installed through your operating system and exposed by your browser. Remote speech-synthesis voices are not used. **Play audio on reveal** plays saved audio or local TTS on the Review page.

## Keep a copy

Exports are separate:

- **Dictionaries → Export ZIP:** the installed dictionary’s original ZIP.
- **Import & export → Settings → Export JSON:** reading preferences, lookup bindings, SRS options, and dictionary ordering.
- **Import & export → Words & progress → Export ZIP:** saved words, definition snapshots, sentences, review history, mastered states, and downloaded recordings with attribution.

Import each file into its matching section. Settings and learning imports replace their own category after confirmation; they do not merge. Dictionaries can be restored before or after settings. Saved cards can be reviewed without their original dictionaries.

Export learning data before removing the extension, clearing browser storage, or moving to another browser. SrsReader has no account or cloud backup. The extension requests access to ordinary websites for parsing and uses local browser storage for its dictionaries and collection.

## Dictionary sources

The supplied Czech dictionary is published by [wty](https://github.com/yomidevs/wiktionary-to-yomitan) from Wiktionary/Kaikki data. Preserve its source and attribution when sharing dictionary files or definitions. Pronunciation files retain the individual licenses shown on their Wikimedia Commons pages.

The offline Czech word-form table comes from [Simplemma](https://github.com/adbar/simplemma), whose sources include Wiktionary/Kaikki and Michal Měchura’s lemmatization lists. Source and license notices are included in `public/licenses/morphology.txt`.

The bundled Bergamot runtime and model registry come from [browsermt/bergamot-translator](https://github.com/browsermt/bergamot-translator) and its model repository. Source and license information is included in `public/licenses/bergamot.txt`.

Examples come from [Tatoeba](https://tatoeba.org/en/downloads), under [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/). Under **Settings → Example sentences**, download or update the selected study language’s corpus, or import a detailed TSV export (plain `.tsv` or `.bz2`). The corpus is indexed locally with language-aware word segmentation, including languages that do not separate words with spaces, and remains available offline. Each example retains its contributor and source link. Examples are not manually proofread; their translations are generated locally in your native language on request. Source information is in `public/licenses/tatoeba.txt`.

## Interface translations

Interface messages are in `src/locales/en.json` and `src/locales/uk.json` and use i18next. To add an interface language, translate the complete English catalog into a file named with its language code, register it in `src/i18n.ts` and its `interfaceLanguages` list, and include its extension description in the locale list in `wxt.config.ts`. Preserve interpolation names inside `{{…}}` and provide the plural forms required by the language. Language names come from `Intl.DisplayNames`; do not add translated names to `src/language-catalog.json`.
