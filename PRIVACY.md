# Privacy Policy for SrsReader Browser Extension

Last updated: November 9, 2026

SrsReader helps you learn languages while reading websites. It provides dictionary lookups, vocabulary highlighting, saved words, and spaced-repetition reviews. Most processing and storage happen on your device. Optional online features send data to the services listed below.

## What Data the Extension Handles

- **Website content:** Text used for word lookup, highlighting, language analysis, translation, and saved example sentences.
- **Source page details:** Saved sentences can include the page URL, title, and time they were saved. SrsReader does not keep a separate log of every page you visit.
- **Learning data:** Vocabulary, cards, notes, imported decks, media, review grades, review times, and learning progress.
- **Preferences:** Language choices, appearance, lookup controls, website exclusions, and other extension settings.
- **Google account information:** If you connect Google Drive sync, SrsReader handles your account ID, email address, and authorization tokens. It does not receive your Google password.

## How Data Is Used

- Page text supports language-learning features. Offline dictionaries and local language tools process text on your device.
- If you enable online UDPipe analysis, page text is sent to the [LINDAT UDPipe service](https://lindat.mff.cuni.cz/services/udpipe/) for word and grammar analysis.
- Enabled online dictionaries and pronunciation providers receive the words or resources requested for a lookup.
- Learning data is used to save vocabulary and schedule reviews.
- Google account information authorizes optional Drive sync and identifies the connected account.

## How Data Is Stored

Settings, learning data, downloaded dictionaries, media, language models, and caches are stored in your browser's local storage systems.

If you connect Google Drive sync, vocabulary, cards, notes, review history, saved sentences, media, and portable settings are uploaded to SrsReader's private app-data folder in your Google Drive. This folder is separate from your ordinary Drive files. Sync is not required to use local learning features.

Local data remains until you delete it or clear the extension's storage. Removing local data does not delete cloud copies. Earlier versions of synced data may remain in retained Drive snapshots. Disconnecting sync does not delete these files.

## Data Sharing and External Services

SrsReader does not sell user data. It does not include advertising, analytics, or tracking services. Data is used only to provide its language-learning features.

Depending on the features you use, SrsReader contacts:

- **Google:** Account sign-in and optional Drive sync. Google receives the data you sync. See [Google's Privacy Policy](https://policies.google.com/privacy).
- **LINDAT UDPipe:** Page text for online language analysis, when enabled. Its [service terms](https://lindat.mff.cuni.cz/services/udpipe/api-reference.php) apply.
- **Nechybujte and SpanishDict:** Requested terms for enabled online dictionary lookups.
- **Wikimedia Commons, Forvo, and LanguagePod101:** Requested words and audio resources for pronunciation features.
- **Resource hosts:** Services such as GitHub, Hugging Face, Tatoeba, and translation-model hosts provide dictionaries, language data, models, and other downloads.

External services receive your IP address and standard network request information. Their own privacy policies apply. The extension's built-in service endpoints use HTTPS.

## User Control

- Pause the reader or disable it on specific websites.
- Enable or disable online parsing and online dictionary features in settings.
- Manage saved vocabulary, cards, learning progress, dictionaries, and other resources in the extension.
- Use local features without connecting a Google account.
- Turn off automatic sync or disconnect Google Drive sync. You can also revoke SrsReader's access through your Google account settings.
- To remove cloud copies, delete SrsReader's hidden app data in Google Drive's settings under **Manage apps**. Disconnect other devices first so they do not upload their local copies again.
- Clearing the extension's storage removes local data. It does not remove data held by external services.

## Permissions

- **Access to HTTP and HTTPS websites:** Reads page text for lookup and highlighting. Also allows requests to learning-resource providers and optional sync services.
- **storage:** Saves extension settings and account connection state.
- **unlimitedStorage:** Supports large offline dictionaries, media, language models, and learning databases.
- **alarms:** Schedules automatic sync and retries.
- **identity:** Authorizes optional Google account access for Drive sync.
- **offscreen:** Runs background workers for imports, example searches, and sync data processing without blocking the visible interface.

## Limited Use

SrsReader follows the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its Limited Use requirements.

Its use of information received from Google APIs also follows the Chrome Web Store User Data Policy, including its [Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use).

User data is not used for advertising, creditworthiness, lending, or purposes unrelated to SrsReader's language-learning features.

## Contact

For privacy questions or data-handling concerns, contact the maintainer through the [SrsReader issue tracker](https://github.com/khajiitvaper2017/SrsReader/issues). Do not post private learning data or authorization tokens in public issues.
