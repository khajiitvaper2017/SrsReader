# Changelog

## 0.3.5 (2026-11-27)

### Changes

- Open menus and switch between screens faster on phones.
- Export a plain-text word list from Study. Filter by deck or language and choose words you struggled with, failed today, or had automatically buried. [#26](https://github.com/khajiitvaper2017/SrsReader/issues/26)

### Fixes

- Make short answers larger on review cards. Prefer reflexive dictionary senses for German reflexive cards when the dictionary provides them. [#26](https://github.com/khajiitvaper2017/SrsReader/issues/26)
- Refresh existing frequency decks using their saved dictionary even when the language is disabled for the reader. [#26](https://github.com/khajiitvaper2017/SrsReader/issues/26)

## 0.3.4 (2026-11-25)

### Changes

- Optimize FSRS parameters in Review settings using your collection’s review history. Existing due dates are preserved. [#20](https://github.com/khajiitvaper2017/SrsReader/issues/20)
- Study available German compound components before the full word in the same deck. For example, study _Last_ before _Lastwagen_. [#25](https://github.com/khajiitvaper2017/SrsReader/issues/25)

### Fixes

- Advance faster after grading or burying a card and start loading audio for upcoming cards sooner. Count learning cards while they wait for their timers, and alternate new cards and reviews while both are available. [#21](https://github.com/khajiitvaper2017/SrsReader/issues/21)
- Move the short answer closer to the top of review cards, remove redundant headings, and prefer shorter examples. German phrases such as _Prost_ no longer get an automatic noun article. [#21](https://github.com/khajiitvaper2017/SrsReader/issues/21)
- Preserve German reflexive headwords during Anki conversion and use the base verb’s dictionary entry when needed. [#22](https://github.com/khajiitvaper2017/SrsReader/issues/22)
- Warn about missing media before importing an Anki package. Updates reuse saved media when available. [#23](https://github.com/khajiitvaper2017/SrsReader/issues/23)
- Retry Google Drive authorization silently and show a single warning when reconnection needs your attention. [#24](https://github.com/khajiitvaper2017/SrsReader/issues/24)

## 0.3.3 (2026-11-20)

### Changes

- Tap a review card or swipe up to reveal the answer. Swipe left for Again or right for Good. The card follows the swipe and shows the action it will take. [#19](https://github.com/khajiitvaper2017/SrsReader/issues/19)
- Select text on a review card to open a dictionary lookup. On a revealed card, you can also save the selection as the short answer.
- Sync one shared collection through Google Drive. If both copies have changes, choose whether to keep the collection on this device or the copy on Drive. To switch to the new sync format, upload first from the device that has your complete collection.
- Sync study data before attachments and transfer only attachment files that are missing from the receiving side. [#18](https://github.com/khajiitvaper2017/SrsReader/issues/18)

### Fixes

- Keep review card swipes inside the page so they do not cause horizontal scrolling.

## 0.3.2 (2026-11-19)

### Fixes

- Keep media-heavy Google Drive sync merges reliable by committing downloaded media in batches before publishing the merged collection. [#17](https://github.com/khajiitvaper2017/SrsReader/issues/17)

## 0.3.1 (2026-11-19)

### Changes

- Highlight text on a revealed review card and save it as the short answer. You can also edit the answer manually. Converted Anki cards use the mapped translation or definition as their short answer. [#15](https://github.com/khajiitvaper2017/SrsReader/issues/15)
- Show genitive singular forms on German review cards when the dictionary supplies them.
- Choose separate autoplay settings for the front and back of review cards. Enable automatic pronunciation in dictionary popups from Audio settings. [#16](https://github.com/khajiitvaper2017/SrsReader/issues/16)
- Read the changelog in the extension under Settings and on the website. The website also includes the terms of service.
- Report an issue on GitHub from the extension’s main navigation.

### Fixes

- Show definitions from newly installed dictionaries on existing review cards alongside the saved short answer. [#15](https://github.com/khajiitvaper2017/SrsReader/issues/15)
- Wait until reviews finish before starting automatic Google Drive sync. [#15](https://github.com/khajiitvaper2017/SrsReader/issues/15)
- Keep the Google Drive sign-in configuration for Chrome Web Store builds separate from unpacked builds.

## 0.3.0 (2026-11-19)

### Changes

- View review activity, retention, card counts, and upcoming reviews in Study. Filter statistics by deck, language, and time period.
- Set review limits, learning steps, and other scheduling options per deck or for mined words in each language. Import supported deck review settings from Anki presets.
- Optionally delay newly mined cards until the next study day. Rating a card while reading still starts learning immediately. [#14](https://github.com/khajiitvaper2017/SrsReader/issues/14)
- Bury cards until the next study day. An optional setting buries a card after three consecutive Again answers on the same study day and shows a notification. [#13](https://github.com/khajiitvaper2017/SrsReader/issues/13)
- Preview converted Anki cards with dictionary definitions before import. [#4](https://github.com/khajiitvaper2017/SrsReader/issues/4)
- Choose which unmapped Anki fields to omit. Import parts of speech and Ankigen disambiguation hints, and edit card hints in SrsReader.
- Import merged IPA pronunciation dictionaries. See the preferred pronunciation in lookup, Words, and Study.
- Play imported word recordings from the pronunciation menu. When you play a recording or voice from the menu, the card remembers it as the default. [#10](https://github.com/khajiitvaper2017/SrsReader/issues/10)
- Mine or forget a card from the lookup popup. The word and actions stay visible while you scroll.
- Use the redesigned Words list to see cleaner definition previews and upcoming review dates. Study highlights the target word in examples and uses clearer review ratings. Scrollable panels and dialogs use consistent controls.
- Start Google Drive sync from Study and see a warning when changes are waiting to upload or sync needs attention. [#7](https://github.com/khajiitvaper2017/SrsReader/issues/7)
- Preview the amount of data affected before resetting reviews, deleting dictionaries, clearing learning data, or resetting the extension. A full reset can also remove the linked Google Drive sync data.
- Choose whether study cards show gendered articles before nouns. Reader word tint now defaults to 30 percent. The app and extension have new icons.
- Reduce page scanning work by deferring off-screen text, and open review sessions faster by loading content after the queue is selected.

### Fixes

- Keep cards linked when their deck is renamed or moved. [#5](https://github.com/khajiitvaper2017/SrsReader/issues/5)
- Preserve studied cards when refreshing a frequency deck.
- Recognize converted Anki cards in the reader. [#6](https://github.com/khajiitvaper2017/SrsReader/issues/6)
- Keep dictionary definitions when an imported card has a reading and the dictionary entry has none. Prefer the imported reading when it contains phonetic notation. [#9](https://github.com/khajiitvaper2017/SrsReader/issues/9)
- Filter dictionary definitions by gender for converted Anki cards when the gender is known. [#11](https://github.com/khajiitvaper2017/SrsReader/issues/11)
- Use the displayed card and the word occurrence in the page for lookup actions and saved-word colors.
- Give nested lookups priority over review mouse shortcuts and preserve German noun capitalization when selecting a lookup result. [#8](https://github.com/khajiitvaper2017/SrsReader/issues/8)
- Use German determiners to fill in missing noun gender, number, and case.
- Keep failed reader scans scheduled for retry when a block of text is removed.
- Count pending study changes without inflating the total with background cache updates. [#12](https://github.com/khajiitvaper2017/SrsReader/issues/12)
- Avoid failures when Google Drive sync handles large collections.
- Keep imported Anki media linked to its cards, including during large imports. Retry failed Chromium background page loads during imports.
- Restore older full backups using the schema version saved in the backup. Preserve changes when separate settings saves run at the same time.
