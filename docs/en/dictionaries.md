# Dictionaries

## Install and update

Open **Settings → Dictionaries**:

- **Wiktionary dictionaries:** choose a study and definition language, then **Import**. **Definitions** contains full entries; **Translations** contains shorter glosses. Choose the same language on both sides for monolingual definitions.
- **Frequency dictionaries:** choose a language and corpus, then **Import**. These supply word ranks, so you still need a definition dictionary.
- **Choose ZIP** or drag a file into the import area to install a Yomitan format-3 dictionary. Set your study language first if the ZIP lacks language information.

Keep Settings open while downloading and importing. You can switch settings tabs while a download or import runs. Once installed, dictionaries work offline.

Drag a dictionary by its handle to change the order, including Nechybujte. You can also focus the handle and press Up or Down. Higher dictionaries appear first in the popup. Each dictionary has three display options:

- **Show:** include its entries even when another dictionary has a match.
- **If needed:** include its entries only when dictionaries above it have no match.
- **Hide:** disable its entries, including cached entries.

Frequency dictionaries use the same rule for ranks. These choices and the order are included in settings exports.

Choose **Check updates**, then **Update** when a release is available. Checks are manual. Without an update source, import a newer ZIP with the same title and languages.

Under **Settings → Reading → Ignore words by tag**, check tags to mark matching words as **Ignored**. In the popup, click a tag and choose **Ignore**. Ignored words have no coloring by default and still open their dictionary entries. Choose a color under **Word colors → Ignored**, or uncheck a tag to restore normal coloring. Tag labels remain visible; hover for the dictionary’s explanation. These choices are included in settings exports.

## Frequency

Lower ranks mean more common words. The popup’s **Freq.** badge combines enabled frequency dictionaries; hover or click for individual ranks. Dictionary order does not change the combined rank.

New cards start with the most frequent words. Under **Settings → Review → Words without frequency**, choose **Introduce last** or **Assign random frequency**. Existing review schedules are unaffected.

## Missing words

Under **Settings → Dictionaries → Word forms**, download additional forms when available. Forms resolve to dictionary headwords and share their cards. Choose the intended entry when a popup offers several candidates.

A form may be recognized while its headword has no definition. More word forms cannot fill that gap: another definition dictionary is needed. Czech `z-` fallback matches show **perfective**; the related base verb’s meaning may differ.

For missing Czech **-čovat** forms, such as **dosvědčoval**, lookup can use the **-čit** perfective counterpart (**dosvědčit**). The label **imperfective** describes the original form: an ongoing or repeated action, rather than a completed one. An existing dictionary entry takes priority.

## Nechybujte online

In **Settings → Dictionaries**, find **Nechybujte (online)** in the ordered list. Choose **Show** or **If needed** to use its Czech definitions, grammar, and examples. The default is **Hide**. No API key is needed. Only words you open are sent to Nechybujte; page scanning does not make online dictionary requests.

**If needed** makes no request when a dictionary above Nechybujte already has an entry for any candidate of the word. Dictionaries below it do not block the request. **Show** uses Nechybujte even when another dictionary has an entry. Both reuse cached results. Fetched entries and word forms stay on this device without expiration. **Hide** stops requests and excludes these cached entries from lookup and page scanning. It does not delete the cache or saved vocabulary. **Refresh from dictionary** on a saved word fetches a fresh copy when Nechybujte's display rule permits it. Mined entries are included in vocabulary exports.

For frequency-based retention, select rank dictionaries under **Spaced repetition → Dynamic desired retention**. A rank of 1 means the most frequent word. Occurrence counts are not ranks. Words without a matching selected rank use global retention.
