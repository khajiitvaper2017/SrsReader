# Reading & audio

## Look up and save

Use your lookup control on a word. **Mine word** saves its definitions and the sentence you opened it from. **Save example** adds another sentence to the same word. Grading in the popup also saves the word.

Definitions and example sentences can be scanned too. **Back** or **Escape** returns from a nested lookup; clicking outside closes the popup. Disable nested lookup under **Settings → Reading → Scan dictionary popups**.

The popup stays attached to the word during scrolling. **Automatic** opens it above or below the word, on the side with more space. It keeps that side during scrolling. Its opening size fits the available space and stays fixed while definitions load. Drag the bottom-right corner to resize it, including toward or across the word. Your chosen size is reused for later lookups on the same page where space permits. Reloading restores the default size. Firefox 147 or later is required.

## Personal definitions

Use your lookup control on an unparsed word to open a definition editor. Enter a definition, or click **Translate word** to translate it into your native language. You can edit the translation before saving.

Click **Add custom definition** (+) beside the audio and sentence translation buttons. The header stays visible while you scroll. **Save definition** adds a separate entry and saves the word and reading sentence for SRS. Personal definitions appear first and are included in vocabulary exports. Use the pencil beside a personal definition to edit it, or the trash button to delete it.

When parser analysis is available, new personal definitions receive matching tags declared by installed dictionaries. The editor previews these tags before saving. They cover part of speech, noun gender and animacy, verb aspect, and reflexivity. Inflection details remain in the grammar hover card.

The word selector also lists parser base forms without dictionary definitions. Select **dovídat se** or **dovídat** to add a personal definition under that form. **If needed** dictionaries can supply the exact base form even when a higher dictionary only has an entry for a different lemma.

Enter each sense on a new line. Blank lines are skipped. The numbered preview shows how the senses will appear after you save.

## Controls

Under **Settings → Reading → Lookup controls**, enable presets or record a **Mouse button**, **Keyboard shortcut**, or **Hold key + hover** binding. Modifiers are supported; release the keys to finish a modifier-only hover binding. Escape cancels recording.

Mouse and keyboard bindings can look up selected text. Some system and browser shortcuts cannot be overridden.

**Input action prevention** blocks normal middle-click or Back/Forward actions when the matching lookup binding is used. Choose where it applies; paused or disabled websites retain normal browser actions.

## Colors and parsing

Under **Settings → Reading → Word colors**, choose text or background colors for unsaved, saved, young, mature, due, mastered, suspended, and unparsed words. Turning colors off leaves parsing enabled.

The toolbar pauses parsing or disables the current site. **Only parse the reading language** scans text identified as your study language. Short passages can use the page language. Foreign text and text with no known language are skipped. Protected browser pages, editable fields, image text, and PDF viewers cannot be scanned.

## Czech grammar analysis

Open **Settings → Reading → Use UDPipe for Czech** to enable contextual Czech analysis. It is off by default and works only when Czech is your study language. Firefox also asks for permission to send website content. Without that permission, parsing stays local.

UDPipe sends eligible Czech text to [LINDAT](https://lindat.mff.cuni.cz/services/udpipe/api-reference.php). It groups uncached text into one request per stable page where size permits. Page changes send only uncached text. Successful results stay in this browser permanently and are reused on other pages and after a restart. Clearing extension data removes them. Parser results are not included in learning or settings exports.

Each attempt can take up to 30 seconds. If a request fails, SrsReader retries after 500 milliseconds and then after 1 second. After three failed attempts, it uses local parsing for 10 minutes. Open pages retry after that time. Other pages retry when opened again.

Click a verb, its auxiliary, or its reflexive **se** or **si** to look up the main verb. For example, **jsem**, **se**, and **dovídal** in **jsem se dovídal** all suggest **dovídat se**. Clicking one highlights all linked words. Intervening words stay unhighlighted. A linking verb, such as **jsem** in **jsem rád**, still suggests **být**. Hover over the popup heading to see the full word form or verb construction. Keyboard focus also shows it. Click the small arrow after the heading to choose another dictionary entry. Nechybujte entries include their listed variants and aspect pairs. The exact contextual lemma appears first when available. Grammar analysis does not change saved word identities or SRS states.

Hover over the popup heading or focus it with the keyboard to see grammar below the full form. This includes case, person, number, gender, tense, mood, aspect, voice, and other available features. For a verb with auxiliaries, it shows the combined construction, then the clicked word’s own form, grammatical features, and relation to another word. Grammar stays available when no dictionary entry matches. The parser can make mistakes. It does not supply a conjugation class or features absent from its analysis.

Each dictionary has its own **Show more** arrow when it contains grammar mismatches. Click it to reveal excluded meanings for the current word. To reveal hidden word candidates, open the word selector and use that dictionary’s **Show more** item. Conflicting tags are red; hover over a tag for an explanation. Meanings with missing or unknown tags stay visible.

For prepositions, the parsed case also filters individual senses with leading case labels, such as **(na + akuzativ)** or **(na + lokál)**. A sense stays visible if its label includes the parsed case. Senses without a recognized case label stay visible. Use the dictionary’s **Show more** arrow to see all senses.

Enable **Automatically ignore proper names** to give recognized names the Ignored appearance. Names stay searchable. This does not save them as ignored. Saved vocabulary states take priority. Words annotated as nationalities are excluded. Name recognition can make mistakes.

LINDAT may use submitted text to improve its systems. Its models have noncommercial use restrictions. See the [service terms](https://lindat.mff.cuni.cz/services/udpipe/api-reference.php).

## Examples and translation

Popups prioritize downloaded Tatoeba examples containing the form you looked up, then fall back to other forms of the same word. For a reflexive verb construction such as **jsem se dověděl**, examples containing all its words come first, even when the words are separated or in a different order. Other forms of **dovědět se** follow. **Another example** cycles through the results. These are separate from the sentence you mine.

Dictionary and Tatoeba source links are hidden by default. To show them, turn off **Settings → Reading → Hide source links**.

- **Translate sentence:** translate a displayed example.
- **Translate current sentence:** translate your reading sentence. Mining keeps that translation with the original.
- **Translate definition:** translate a monolingual dictionary definition.

Translations use your native language and run locally. Models download on first use; not every language pair is supported. Saved translations work offline. Editing a sentence removes its old translation.

Download or update examples under **Settings → Dictionaries → Example sentences**, or import a detailed Tatoeba `.tsv` or `.bz2` export.

## Audio

Use the speaker to hear a word or sentence. Right-click, Shift-click, or hold it to open **Audio sources**. Click a recording or system voice to try it. Recording credits are hidden by default. Turn off **Settings → Reading → Hide source links** to show them in this menu. Choose an installed local voice under **Settings → Audio & translation → Pronunciation**. If none is available, install a system voice for your study language.

**Download natural pronunciations** optionally saves word recordings from Wiktionary/Lingua Libre sources. Sentence audio uses the system voice. **Play audio on reveal** enables automatic playback during review.

**Settings → Audio & translation → Pronunciation → Normalize recording volume** is enabled by default. It levels the loudness of recordings during playback, with limited amplification and peak protection. Stored audio is unchanged. System TTS uses device volume.
