# SrsReader

A local dictionary and spaced-repetition reader for desktop Chromium browsers and Firefox. Czech is currently supported.

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

On first installation, a setup window opens. Choose a language, import a dictionary, and choose one or more lookup controls. Nothing is selected for lookup by default. **Finish setup** is available once a dictionary and a lookup control are selected.

Setup saves your choices as you go. You can return to it with **Settings → Open setup**.

## Dictionaries

Open **Settings → Dictionaries → Choose ZIP** and import a Yomitan format-3 term or frequency dictionary. You can also drag the ZIP into the import area. Keep Settings open until the import finishes.

The Czech dictionary in `dicts/wty-cs-cs.zip` contains Czech definitions. A download link is available in Settings before your first import. You can install multiple dictionaries, change their order, and disable them individually.

Word forms follow dictionary references to their base words. Forms and their base word share a card and review history. When several base words are possible, choose the intended word in the dictionary popup. References whose targets have no definition remain unavailable until a dictionary supplies them.

If a Czech form has no dictionary entry, the reader also checks a bundled offline word-form table. A match opens the base word and uses its card. Existing dictionary entries and references take priority. The base word must still have an enabled dictionary definition; parsing cannot supply a missing meaning or turn a separate prefixed verb into its unprefixed verb.

Choose **Check updates** beside an installed dictionary to check its publisher’s update source. If an update is available, choose **Update** to install it. No update checks happen automatically. Dictionaries without update metadata can be replaced by importing a newer ZIP with the same title and languages.

### Frequency dictionaries

Open **Settings → Dictionaries → Frequency dictionaries** to browse [Leipzig to Yomitan](https://github.com/StefanVukovic99/leipzig-to-yomitan/releases/tag/v2024-08-31-18-57-16-00-00). Filter by language and corpus type, search for a corpus or region, and sort by language, type, or download size. **Import** downloads and installs the selected dictionary. The menu uses the Rank edition and assigns its language automatically. Browsing the catalog works offline; importing needs a connection.

You can also import a frequency ZIP with **Choose ZIP**. Select the correct **Language** first if the ZIP has no language metadata. A frequency dictionary supplies ranks, not definitions; keep a term dictionary installed for reading.

New cards use the first enabled frequency dictionary for the selected language. Use **↑** to change which list comes first. The base word’s numeric rank determines its position, from most common to least common. Already introduced cards keep their review schedule.

Under **Settings → Spaced repetition → Words without frequency**, choose **Introduce last** to place unranked words after ranked words, or **Assign random frequency** to mix them into the dictionary’s rank range. Random positions stay stable between reviews and exports. Without an enabled frequency dictionary, these options use the order words were saved or a stable random order, respectively.

## Read and save words

Open a website in your selected language and use your lookup control on a highlighted word. Press **Escape** or click outside the popup to close it.

Definitions are parsed too. Use the same lookup control on a word in a definition to open it. **Back** or **Escape** returns to the previous entry; the close button closes the popup. Turn this off with **Settings → Reading & appearance → Scan dictionary popups**.

Under **Settings → Reading & appearance → Word colors**, choose **Off**, **Text**, or **Background** and a color for each state. New words are words you have not saved; Saved words have not been reviewed yet. Learning includes relearning, Reviewing means the next review is in the future, and Due means a review is ready. Known and suspended words have their own styles. Unparsed covers words without a dictionary match. The same styles apply on websites and inside definitions. **Color words** switches all colors off without changing parsing or your saved styles; **Reset colors** restores the defaults.

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

Choose **I know this** to mark a word known without scheduling it. The toolbar lets you pause all parsing or disable the current website. Browser-protected pages, image/canvas text, PDF viewers, and editable fields are not parsed.

## Review

Open **Review** from the toolbar. Choose **Word** or **In context** to change the front of the card. **Show answer** or **Space** reveals the meanings and saved sentence. Grade with **Again** (key **1**) or **Good** (key **3**).

**Settings → Spaced repetition** contains:

- **Use only Again and Good:** on by default for lookup popups and Review. Turn it off to show Hard and Easy as well, with keys **1–4** from Again to Easy.
- **New words per day:** 0–10,000; default 20. Due reviews are unlimited. Reviews made while reading remain available after this limit.
- **Words without frequency:** Introduce last (default) or Assign random frequency.
- **Desired retention:** 70–99%; default 90%. Higher retention generally requires more reviews. Changes apply to future reviews.
- **Default card front:** Word only or Word in sentence. Word only is the default.

Scheduling uses ts-fsrs 5.4.2 / FSRS-6, with 1-minute and 10-minute learning steps and a 10-minute relearning step. **Undo last review** restores the previous state unless that word has subsequently changed.

Use **Words** to search, edit a saved definition or sentence, mark a word known, suspend it, or delete it. **Refresh from dictionary** replaces a saved definition with the current dictionary definition. Dictionary updates do not automatically rewrite saved definitions.

## Audio

Use the speaker beside a word to play a saved recording or an installed local voice for the word’s language. The sentence speaker uses local system speech synthesis. Choose a voice under **Settings → Pronunciation**.

Enable **Download natural pronunciations** to fetch word recordings from Wikimedia Commons using Wiktionary and Lingua Libre sources. This is off by default. When enabled, playing or mining a word requests that word’s recording and saves it locally. Website URLs and sentences are not sent to the pronunciation service. Recording credits link to the source and remain in learning exports.

Sentence audio and the fallback word voice require a voice for the selected language installed through your operating system and exposed by your browser. Remote speech-synthesis voices are not used. **Play audio on reveal** plays saved audio or local TTS on the Review page.

## Keep a copy

Exports are separate:

- **Dictionaries → Export ZIP:** the installed dictionary’s original ZIP.
- **Import & export → Settings → Export JSON:** reading preferences, lookup bindings, SRS options, and dictionary ordering.
- **Import & export → Words & progress → Export ZIP:** saved words, definition snapshots, sentences, review history, known states, and downloaded recordings with attribution.

Import each file into its matching section. Settings and learning imports replace their own category after confirmation; they do not merge. Dictionaries can be restored before or after settings. Saved cards can be reviewed without their original dictionaries.

Export learning data before removing the extension, clearing browser storage, or moving to another browser. SrsReader has no account or cloud backup. The extension requests access to ordinary websites for parsing and uses local browser storage for its dictionaries and collection.

## Dictionary sources

The supplied Czech dictionary is published by [wty](https://github.com/yomidevs/wiktionary-to-yomitan) from Wiktionary/Kaikki data. Preserve its source and attribution when sharing dictionary files or definitions. Pronunciation files retain the individual licenses shown on their Wikimedia Commons pages.

The offline Czech word-form table comes from [Simplemma](https://github.com/adbar/simplemma), whose sources include Wiktionary/Kaikki and Michal Měchura’s lemmatization lists. Source and license notices are included in `public/licenses/morphology.txt`.
