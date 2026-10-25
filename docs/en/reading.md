# Reading & audio

## Look up and save

Use your lookup control on a word. **Mine word** saves its definitions and the sentence you opened it from. **Save example** adds another sentence to the same word. Grading in the popup also saves the word.

Definitions and example sentences can be scanned too. **Back** or **Escape** returns from a nested lookup; clicking outside closes the popup. Disable nested lookup under **Settings → Reading → Scan dictionary popups**.

The popup stays attached to the word during scrolling. **Automatic** opens it above or below the word, on the side with more space. It keeps that side during scrolling. Its opening size fits the available space and stays fixed while definitions load. Drag the bottom-right corner to resize it, including toward or across the word. Your chosen size is reused for later lookups on the same page where space permits. Reloading restores the default size. Firefox 147 or later is required.

## Personal definitions

Use your lookup control on an unparsed word to open a definition editor. Enter a definition, or click **Translate word** to translate it into your native language. You can edit the translation before saving.

Click **Add custom definition** (+) beside the audio and sentence translation buttons. The header stays visible while you scroll. **Save definition** adds a separate entry and saves the word and reading sentence for SRS. Personal definitions appear after dictionary entries and are included in vocabulary exports. Use the pencil beside any definition to edit it. Editing a dictionary definition saves a custom override for this word. Cards and popups show the override. The dictionary entry stays unchanged. Use **Restore dictionary definition** to remove the override. The trash button deletes only a personal definition.

When parser analysis is available, new personal definitions receive matching tags declared by installed dictionaries. The editor previews these tags before saving. They cover part of speech, noun gender and animacy, verb aspect, and reflexivity. Inflection details remain in the grammar hover card.

The word selector also lists parser base forms without dictionary definitions. Select **dovídat se** or **dovídat** to add a personal definition under that form. **If needed** dictionaries can supply the exact base form even when a higher dictionary only has an entry for a different lemma.

Enter each sense on a new line. Blank lines are skipped. The numbered preview shows how the senses will appear after you save.

## Controls

Open **Settings → Controls → Lookup controls**. Enable a preset or select the **Keyboard or mouse shortcut** input. Press a key or mouse button over the input to add a binding. You can include Ctrl, Alt, Shift, or Meta. To use a key while hovering over text, select **Hold key + hover**. Press the key, or press and release modifiers to add a modifier-only hover binding. Escape cancels capture. Tab moves to the next input. Remove custom bindings with their trash buttons.

Mouse and keyboard bindings can look up selected text. Some system and browser shortcuts cannot be overridden.

**Input action prevention** blocks normal middle-click or Back/Forward actions when the matching lookup binding is used. Choose where it applies. Websites with parsing off retain normal browser actions.

## Colors and parsing

Under **Settings → Reading → Word colors**, choose text or background colors for unsaved, saved, young, mature, due, mastered, suspended, and unparsed words. Turning colors off leaves parsing enabled.

**Settings → Reading → Parse websites automatically** starts parsing on websites by default. It is on by default. Turn it off to choose sites manually. In the extension toolbar, use **Enabled on [site]** to turn parsing on or off for the current site. Your choice is saved for that hostname and applies to all its pages. Sites you enable manually stay enabled when automatic parsing is off. Sites you disable stay disabled when automatic parsing is on. The toolbar also has the automatic parsing switch. Dictionary popups use the separate **Scan dictionary popups** setting.

Under **Settings → Reading**, choose a language in **Language-specific settings**, then select **Load and color words**:

- **Automatic** (default): color local words first and update online words as their entries arrive. All dictionaries follow their **Show**, **If needed**, and **Hide** settings. Cached entries are reused.
- **When opened**: load and color words only when you open them with a lookup control. Other words stay uncolored, including words in installed dictionaries or the cache.

The choice applies to all dictionaries for that language, on websites and in scanned dictionary popups. Each language has its own choice. Online dictionaries set to **Hide** are never contacted. Online dictionaries receive individual words according to their display settings.

New text, including added subtitle words, is processed separately. Existing colors stay visible while results load. Menu and toolbar changes do not trigger a text lookup.

Parsing detects text in any language in **Settings → General → Studied languages**. Short passages can use the page language. Foreign text and text with no known language are skipped. Protected browser pages, editable fields, image text, and PDF viewers cannot be scanned.

## Grammar analysis with UDPipe

Open **Settings → Reading → Use UDPipe** to enable grammar analysis in context. It is off by default. The switch is available when UDPipe supports at least one studied language. It applies to all supported studied languages. SrsReader selects the model for that language automatically. Firefox also asks for permission to send website content. Without that permission, parsing stays local.

Under **Settings → Reading**, choose a language in **Language-specific settings**, then use **UDPipe model** to choose the corpus that best matches your reading. Each option shows the corpus name and its main text types. The default favors fiction or literary text. Some default corpora also contain other text types. Your choice is saved separately for each study language.

The selector appears for these languages:

| Study language | Default model                       | Other model                       |
| -------------- | ----------------------------------- | --------------------------------- |
| Czech          | FicTree                             | Czech Academic Corpus (CAC)       |
| Irish          | Irish Dependency Treebank (IDT)     | TwittIrish                        |
| Korean         | KAIST Tree-Tagging Corpus           | Korean as a Second Language (KSL) |
| Latin          | Perseus                             | Index Thomisticus Treebank (ITTB) |
| Portuguese     | CINTIL-UDep                         | Porttinari                        |
| Romanian       | Romanian Reference Treebank (RRT)   | SiMoNERo                          |
| Russian        | Taiga                               | Russian National Corpus: Poetry   |
| Ukrainian      | Institute for Ukrainian corpus (IU) | ParlaMint                         |

Enable **Use UDPipe** to change the model. Each model has its own cached results.

UDPipe sends eligible text in your studied languages to [LINDAT](https://lindat.mff.cuni.cz/services/udpipe/api-reference.php). It groups uncached text into one request per stable page where size permits. Page changes send only uncached text. Successful results stay in this browser permanently and are reused on other pages and after a restart. Clearing extension data removes them. Parser results are not included in learning or settings exports.

Each attempt can take up to 30 seconds. If a request fails, SrsReader retries after 500 milliseconds and then after 1 second. After three failed attempts, it uses local parsing for 10 minutes. Open pages retry after that time. Other pages retry when opened again.

Click a verb, its auxiliary, or its reflexive **se** or **si** to look up the main verb. For example, **jsem**, **se**, and **dovídal** in **jsem se dovídal** all suggest **dovídat se**. Clicking one highlights all linked words. Intervening words stay unhighlighted. A linking verb, such as **jsem** in **jsem rád**, still suggests **být**. Hover over the popup heading to see the full word form or verb construction. Keyboard focus also shows it. Click the small arrow after the heading to choose another dictionary entry. Nechybujte entries include their listed variants and aspect pairs. The exact contextual lemma appears first when available. Grammar analysis does not change saved word identities or SRS states.

Hover over the popup heading or focus it with the keyboard to see grammar below the full form. This includes case, person, number, gender, tense, mood, aspect, voice, and other available features. For a verb with auxiliaries, it shows the combined construction, then the clicked word’s own form, grammatical features, and relation to another word. Grammar stays available when no dictionary entry matches. The parser can make mistakes. It does not supply a conjugation class or features absent from its analysis.

Cards and popups share dictionary visibility choices for each saved word. Use the eye button to hide or show a dictionary for that word. Choices do not affect other cards.

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

Translations replace the displayed definitions or example sentence. Click the crossed translation button to restore the original. Click it again to show the saved translation.

**Settings → Audio & translation → Translation** has two independent switches:

- **Automatically translate example sentences:** translates example and reading sentences into your native language when you open them.
- **Automatically translate dictionary definitions:** translates dictionary definitions into your native language when you open them.

Both switches are off by default. Unsupported language pairs stay in the original language. Local models can download on first use. If the browser translator needs activation, click a translation button once to prepare it. You can still use the translation button to show the original.

Translations use your native language and run locally. Models download on first use; not every language pair is supported. Saved translations work offline. Editing a sentence removes its old translation.

Download or update examples under **Settings → Dictionaries → Example sentences**, or import a detailed Tatoeba `.tsv` or `.bz2` export.

## Audio

Use the speaker to hear a word or sentence. Right-click, Shift-click, or hold it to open **Audio sources**. Click a recording or system voice to try it. Recording credits are hidden by default. Turn off **Settings → Reading → Hide source links** to show them in this menu. Choose an installed local voice under **Settings → Audio & translation → Pronunciation**. If none is available, install a system voice for your study language.

**Settings → Audio & translation → Pronunciation → Audio sources** controls which sources download word recordings when you play or save a word. Only the word is sent. Use each switch to enable or disable Wikimedia Commons (including Lingua Libre), LanguagePod101, or Forvo. All three are enabled by default. Drag the handle beside a source to set its priority. You can also focus the handle and press Up or Down. Enabled sources are checked from top to bottom. Disabled sources receive no requests. If all sources are disabled, words use saved recordings or the system voice. Source settings also apply when you open **Audio sources**. Saved recordings remain available and are reused before downloading another recording. Open **Audio sources** to choose another recording. LanguagePod101 is available only for languages with a Pod101 or Class101 dictionary. Forvo uses recordings for your study language. If a provider is unavailable, the other providers remain available. Forvo can block automated requests. Saved recordings work offline. Sentence audio uses the system voice. **Play audio on reveal** enables automatic playback during review.

**Settings → Audio & translation → Pronunciation → Normalize recording volume** is enabled by default. It levels the loudness of recordings during playback, with limited amplification and peak protection. Stored audio is unchanged. System TTS uses device volume.
