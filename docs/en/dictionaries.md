# Dictionaries

Open **Settings → Dictionaries** and choose a language. The selector includes studied languages and languages with installed dictionaries. **Vocabulary** contains definitions, word forms, and example sentences. **Frequency** contains word rankings. Download catalogs use the selected language.

A ZIP that contains definitions and rankings appears in both tabs. Vocabulary uses **Show**, **If needed**, and **Hide**. Frequency uses **Enabled** and **Disabled**. Each part has its own order. Removing the ZIP removes both parts. Other languages keep their own settings.

## Search

Open the **Search** tab and choose a language. **Word or reading** finds dictionary words and readings that contain your text. **Definition** finds words whose definitions contain your text. For example, search English definitions for **animal** to find words with that meaning in the selected language.

Enter your text and press Enter or choose **Search**. Searches ignore letter case and use enabled, installed definition dictionaries. Online dictionaries and frequency-only dictionaries are not searched. Choose a result to expand its full definition. Choose **Load more** to see the next 50 entries. Large dictionaries can take longer to search.

Install a dictionary or change its display option under **Settings → Dictionaries**. Both **Show** and **If needed** dictionaries are searched. Selecting a language here does not change your studied-languages list.

## Install and update

Open **Settings → Dictionaries**:

- **Vocabulary → Wiktionary dictionaries:** choose a definition language, then **Import**. **Definitions** contains full entries; **Translations** contains shorter glosses. Choose the same language on both sides for monolingual definitions.
- **Frequency:** choose a corpus, then **Import**. These supply word ranks, so you still need a definition dictionary.
- **Choose ZIP** or drag a file into the import area to install a Yomitan format-3 dictionary. Choose **Language-specific settings** first if the ZIP lacks language information.

Keep Settings open while downloading and importing. You can switch settings tabs while a download or import runs. A floating alert in the lower-right corner shows the current step and progress. When the total is known, it also estimates the time left in that step. Completion and errors appear in the same place. Use the close button to dismiss a result. Once installed, dictionaries work offline.

The same alerts show progress and results for example sentences, word-form data, and backups in Settings. Study actions also show floating alerts.

Drag a dictionary by its handle to change the order, including online dictionaries. You can also focus the handle and press Up or Down. Higher dictionaries appear first in the popup. Each vocabulary dictionary has three display options:

- **Show:** include its entries even when another dictionary has a match.
- **If needed:** include its entries only when dictionaries above it have no match.
- **Hide:** disable its entries, including cached entries.

Online dictionaries work best as secondary dictionaries. Place them below installed dictionaries and select **If needed** to reduce the risk of rate limiting.

Frequency dictionaries use **Enabled** to contribute ranks and **Disabled** to exclude them. These choices and the order are included in settings exports.

Choose **Check updates**, then **Update** when a release is available. Checks are manual. Without an update source, import a newer ZIP with the same title and languages.

Under **Settings → Reading → Ignore words by tag**, check tags to mark matching words as **Ignored**. In the popup, click a tag and choose **Ignore**. Ignored words have no coloring by default and still open their dictionary entries. Choose a color under **Word colors → Ignored**, or uncheck a tag to restore normal coloring. Tag labels remain visible; hover for the dictionary’s explanation. These choices are included in settings exports.

## Frequency

Lower ranks mean more common words. The popup’s **Freq.** badge combines enabled frequency dictionaries; hover or click for individual ranks. Dictionary order does not change the combined rank.

New cards start with the most frequent words. Under **Settings → Review → Words without frequency**, choose **Introduce last** or **Assign random frequency**. Existing review schedules are unaffected.

## Immersion Frequency

Open **Settings → Dictionaries**, choose a language, then open **Frequency**. The built-in **Immersion Frequency** row is always available. Select **Enabled** to build rankings from website text parsed while you read. It is enabled by default. Each language has its own setting. Popup definitions and review text do not add hits. It does not create review cards automatically.

The first candidate for each word receives a primary hit. Other candidates receive secondary hits. Inflected forms and duplicate candidates share their base word's count. A word without a dictionary entry still counts when the parser identifies its base word. Punctuation and unidentified words do not count.

The score is **primary hits + multiplier × secondary hits**. **Secondary-hit multiplier** defaults to **0.3**. Enter **0–1** with up to two decimal places, then leave the field or press Enter to save. Changing it recalculates scores from saved counts. Higher scores receive lower frequency ranks. Equal scores share a rank. Click a word's frequency badge to see its primary hits, secondary hits, score, and rank.

Each exact text block counts only once per language, including across websites, tabs, reloads, and browser restarts. Repeated words within a new block each add a hit. Parser changes do not recount old blocks or revise their contributions.

Select **Enabled** to collect hits and combine its ranks with other enabled frequency dictionaries. Disable the other frequency dictionaries to use it alone. Select **Disabled** to stop counting and exclude its ranks. Saved counts, ranks, and counted-block history stay available. Select **Enabled** again to resume counting.

**Export ZIP** saves the current ranks as a standard frequency dictionary. Importing that ZIP creates a fixed snapshot. Use **Settings → Backups → Words & progress → Export ZIP** to preserve the live dictionary, both hit counts, its multiplier, and counted-block history. Enabled states, vocabulary display options, and ordering are included in the settings export.

## Missing words

Under **Settings → Dictionaries → Word forms**, download additional forms when available. Forms resolve to dictionary headwords and share their cards. Choose the intended entry when a popup offers several candidates.

A form may be recognized while its headword has no definition. More word forms cannot fill that gap: another definition dictionary is needed. Czech `z-` fallback matches show **perfective**; the related base verb’s meaning may differ.

For missing Czech **-čovat** forms, such as **dosvědčoval**, lookup can use the **-čit** perfective counterpart (**dosvědčit**). The label **imperfective** describes the original form: an ongoing or repeated action, rather than a completed one. An existing dictionary entry takes priority.

## Nechybujte online

In **Settings → Dictionaries**, find **Nechybujte (online)** in the ordered list. Choose **Show** or **If needed** to use its Czech definitions, grammar, and examples. The default is **Hide**. No API key is needed. **Settings → Reading → Load and color words** controls loading separately for each language. **When opened** sends only words you open. **Automatic** also loads entries during page scanning and follows the dictionary’s display setting.

**If needed** makes no request when a dictionary above Nechybujte already has an entry for any candidate of the word. Dictionaries below it do not block the request. **Show** uses Nechybujte even when another dictionary has an entry. Both reuse cached results. Fetched entries and word forms stay on this device without expiration. **Hide** stops requests and excludes these cached entries from lookup and page scanning. It does not delete the cache or saved vocabulary. **Refresh from dictionary** on a saved word fetches a fresh copy when Nechybujte's display rule permits it. Mined entries are included in vocabulary exports.

## SpanishDict online

In **Settings → Dictionaries**, choose **Spanish**, then open **Vocabulary**. Find **SpanishDict (online)** and select **Show** or **If needed**. The default is **Hide**. No API key or installation is needed.

SpanishDict supplies English translations, parts of speech, usage labels, and Spanish–English examples. Open **Examples** under a sense to read its sentences. Inflected forms and spelling corrections use the returned headword. For example, **cojer** opens **coger**. English-to-Spanish entries and machine translations are not included.

SpanishDict sends one request at a time without a fixed delay. Local entries appear first. Online entries color words as they arrive. You can open words during loading. If SpanishDict limits requests, the warning shows how long to wait before trying again. The wait follows the server's retry time, or defaults to one minute. Cached entries remain available.

**Show** includes SpanishDict even when another dictionary has a match. **If needed** sends a request only when dictionaries above it have no matching entry. Drag the row to change this order. **Settings → Reading → Load and color words** controls loading for Spanish. **When opened** sends only words you open. **Automatic** also loads entries during page scanning and follows the dictionary’s display setting.

Fetched entries stay on this device without expiration. Cached words and fetched forms work offline during lookup and page scanning. **Hide** stops requests and excludes cached SpanishDict entries. It keeps the cache and saved vocabulary. **Refresh from dictionary** on a saved word fetches a fresh copy when the display rule permits it. Saved definitions are included in vocabulary exports. If SpanishDict is unavailable, the popup shows a warning and keeps results from other dictionaries.

For frequency-based retention, select rank dictionaries under **Spaced repetition → Dynamic desired retention**. A rank of 1 means the most frequent word. Occurrence counts are not ranks. Words without a matching selected rank use global retention.
