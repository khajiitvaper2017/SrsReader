# Dictionaries

## Install and update

Open **Settings → Dictionaries**:

- **Wiktionary dictionaries:** choose a study and definition language, then **Import**. **Definitions** contains full entries; **Translations** contains shorter glosses. Choose the same language on both sides for monolingual definitions.
- **Frequency dictionaries:** choose a language and corpus, then **Import**. These supply word ranks, so you still need a definition dictionary.
- **Choose ZIP** or drag a file into the import area to install a Yomitan format-3 dictionary. Set your study language first if the ZIP lacks language information.

Keep Settings open while downloading and importing. Once installed, dictionaries work offline.

Use **↑** and **↓** to set definition priority: higher dictionaries appear first in the popup. Uncheck a dictionary to disable it.

**Settings → Reading & appearance → Show first dictionary only** is enabled by default. It shows all definitions from the first dictionary with a match. **More dictionaries** reveals the remaining entries; **Fewer dictionaries** collapses them. Turn the setting off to show all dictionaries.

Choose **Check updates**, then **Update** when a release is available. Checks are manual. Without an update source, import a newer ZIP with the same title and languages.

Under **Settings → Reading & appearance → Ignore words by tag**, check tags to mark matching words as **Ignored**. In the popup, click a tag and choose **Ignore**. Ignored words have no coloring by default and still open their dictionary entries. Choose a color under **Word colors → Ignored**, or uncheck a tag to restore normal coloring. Tag labels remain visible; hover for the dictionary’s explanation. These choices are included in settings exports.

## Frequency

Lower ranks mean more common words. The popup’s **Freq.** badge combines enabled frequency dictionaries; hover or click for individual ranks. Dictionary order does not change the combined rank.

New cards start with the most frequent words. Under **Settings → Spaced repetition → Words without frequency**, choose **Introduce last** or **Assign random frequency**. Existing review schedules are unaffected.

## Missing words

Under **Settings → Word forms**, download additional forms when available. Forms resolve to dictionary headwords and share their cards. Choose the intended entry when a popup offers several candidates.

A form may be recognized while its headword has no definition. More word forms cannot fill that gap: another definition dictionary is needed. Czech `z-` fallback matches show **perfective**; the related base verb’s meaning may differ.

For missing Czech **-čovat** forms, such as **dosvědčoval**, lookup can use the **-čit** perfective counterpart (**dosvědčit**). The label **imperfective** describes the original form: an ongoing or repeated action, rather than a completed one. An existing dictionary entry takes priority.
