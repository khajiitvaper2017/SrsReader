# Getting started

1. Add one or more **Studied languages** and **Native languages**. The browser suggests the first native language. This language is used for translations.
2. Choose **Automatic** or **When opened** under **Websites → Load words**.
3. Enable **Use UDPipe** if you want online grammar analysis.
4. Under **Dictionaries**, select a language tab and import its dictionary. The [dictionary guide](dictionaries.md) explains the available downloads.
5. Choose a lookup control, such as **Middle mouse** or **Shift + hover**. None is selected by default.
6. Choose **Finish setup** to save your settings and open **Review**.

Extra word forms and example sentences are optional. Open **Settings → Dictionaries**, select a language, and use the download buttons under **Word forms** or **Example sentences**.

UDPipe is off by default. Enabling it sends eligible text to LINDAT for grammar analysis. If multiple models are available, choose the corpus closest to your reading. Provider credits, model licenses, and service terms are beside these controls. The [reading guide](reading.md) explains the parser options.

Open a website, use your lookup control on a word, and choose **Mine word**. Open **Review** to study saved words.

Change languages under **Settings → General → Languages**. **Interface language** offers English, Ukrainian, or **Automatic**. Automatic selection uses the first native language; languages other than English and Ukrainian use the English interface. You can reopen setup from **Settings → General**. **Docs** stays available during setup.

Select at least one language under **Native languages**. The first language is the translation target. All selected native languages are included in the Wiktionary download filter, and dictionary definitions in these languages are shown without translation. Drag selected languages to change their order. For keyboard control, focus the input and press Left Arrow to select a language, then use Alt + Left Arrow or Alt + Right Arrow to move it. Language selectors and tabs show flags beside language names.

Select a settings section first, then a language tab below it. The address keeps the selected section, language, and dictionary type. Reload the page or use Back and Forward to return to that selection.

The **Studied languages** list shows supported features below each language: grammar analysis with UDPipe, extra word forms, the Nechybujte online dictionary, and downloadable example sentences. Languages with more features appear first. Languages with the same number of features are in alphabetical order for your interface language. Labels show support even if a feature is disabled or its data has not been downloaded. Text-to-speech depends on voices installed on your device and does not affect the order.

On narrow screens, open the menu in the top-right corner to switch pages. The study page shows each language and deck as a card with its counts and actions. Choose a settings section or a guide topic from the list above its content.

## Appearance

Open **Settings → General → Appearance**. Choose **Light**, **Dark**, **OLED (black)**, or **System** to follow your device. Dark uses near-black surfaces. OLED uses black backgrounds. Both keep secondary labels close to the main text color.

**Accent color** sets the color for buttons, links, and selected controls. The default is orange (`#D26400`). Use the color picker or enter a six-digit hex code, such as `#0080FF`. The theme and accent also apply to dictionary popups.

## Load a build

- **Chrome:** open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `.output/chrome-mv3`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `.output/firefox-mv3/manifest.json`.

Firefox temporary add-ons are removed when Firefox closes. Keep [backups](data.md); a permanent installation requires a signed package.

## Automatic reloads

Use the development build to reload the extension automatically when source files change.

1. Run `pnpm dev` for Chrome or `pnpm dev:firefox` for Firefox in the project folder.
2. Disable the regular build if it is installed. Keep it installed to preserve its data.
3. In Chrome, use **Load unpacked** to load `.output/chrome-mv3-dev`. In Firefox, use **Load Temporary Add-on** to load `.output/firefox-mv3-dev/manifest.json`.
4. Keep the command running while you edit files.

WXT updates extension pages and reloads background and content scripts as needed. A regular `pnpm build` does not enable automatic reloads. To stop the development server, press Ctrl+C in its terminal.

Chrome treats the development folder as a separate extension with separate data. Your regular installation keeps its data. Use [backups](data.md) to copy your saved words and settings, and import dictionaries into the development installation.
