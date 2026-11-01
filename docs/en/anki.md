# Anki cards

## Import a package

1. Open **Study**.
2. Select **Import Anki package**.
3. Choose an `.apkg` file.
4. Select the study language.
5. Select the decks to import.
6. Select a card format.
7. Check the field mappings and sample values.
8. Select **Import Anki package**.

**Keep original templates** preserves the package’s fields, templates, styles, tags, scripts, and media. Each source card keeps its own review history. Map the word and reading fields to connect the notes to dictionaries and reading reviews.

**Use dictionary cards** creates notes with the app’s templates and saved dictionary definitions. Map **Word** and, when available, **Reading**. You can also map a sentence, sentence furigana, sentence translation, word audio, sentence audio, and image or video. Other fields and media remain available. Notes with the same language, word, and reading are combined into one study card. Their recorded answers are combined by date.

For Japanese, map the written word and its pronunciation separately. Different readings of the same spelling remain separate words. A sentence’s furigana is separate from the word’s reading. Empty fields are valid.

**Keep existing content** skips previously imported records. **Update imported content** replaces matching imported content and adds previously unseen source reviews. Answers recorded in the app are retained. An incompatible field-schema update stops before changing saved cards.

Recorded answers are used to rebuild schedules with the selected review algorithm. Due dates can differ from Anki. Suspended cards remain suspended. Cards without usable answers start new. Import progress continues in the extension’s import host.

## Edit and refresh

Open **Edit note** above a review card to edit its fields. Values can contain HTML. Empty values and whitespace are preserved. A note can produce several cards; changing its fields changes all those cards.

App-created cards and dictionary conversions show saved definitions. To use current dictionary entries, select **Refresh from dictionary**. This replaces the mapped definitions field and its required media. It does not change other fields, templates, schedules, or history. Personal definitions and dictionary overrides are kept. Direct HTML edits in the definitions field are replaced by refresh.

To add or edit personal definitions, open the dictionary controls in the note editor. Dictionary changes appear on the card after refresh. Install and enable dictionaries in **Settings → Dictionaries**.

## Reading reviews

When several cards are linked to a word, use **Card used for reading reviews** in its lookup or word details to select the card to grade. Only that card receives the answer. The word can remain due when another linked card is due. Mining reuses the selected card.

## Export

1. Open **Study**.
2. Select **Export Anki package**.
3. Select a language.
4. Select a deck or **All decks**.
5. Select **Export Anki package**.

The `.apkg` contains saved fields, templates, styles, media, schedules, suspension, and review history. Export uses saved content and does not refresh dictionaries. You can import the file into Anki or this app.

## Template support

Cards support field replacement, conditional sections, front-side reuse, standard cloze cards, furigana, hints, typed answers, audio, video, and local template scripts. The app uses its field editor for `edit:` fields. Imported templates retain that syntax for Anki export.

Packages can load their local scripts, styles, fonts, images, audio, and video. Card script settings are saved separately for each imported package. Missing resources are reported above the card.

Scripts run in an isolated viewer and cannot grade cards or use extension APIs. AnkiConnect, desktop Anki commands, HyperTTS-specific voices, image occlusion, and MathJax are unavailable. Images, audio, and video must be included in the package. External HTTPS styles and fonts require a network connection. Firefox requires version 154 or newer.
