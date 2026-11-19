# Changelog

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
