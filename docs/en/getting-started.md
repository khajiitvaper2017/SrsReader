# Getting started

1. Add one or more **Studied languages** and confirm your **Native language**. The native language is suggested from your browser and is used for translations.
2. Under **Dictionaries**, use **Language-specific settings** to choose a language and import its dictionary. The [dictionary guide](dictionaries.md) explains the available downloads.
3. Choose a lookup control, such as **Middle mouse** or **Shift + hover**. None is selected by default.
4. Choose **Finish setup**. Available word forms and example sentences download for each studied language.

Open a website, use your lookup control on a word, and choose **Mine word**. Open **Review** to study saved words.

Change languages under **Settings → General → Languages**. **Interface language** offers English, Ukrainian, or **Same as native language**; other native languages use the English interface. You can reopen setup from **Settings → General**. **Docs** stays available during setup.

The **Studied languages** list shows supported features below each language: grammar analysis with UDPipe, extra word forms, the Nechybujte online dictionary, and downloadable example sentences. Languages with more features appear first. Languages with the same number of features are in alphabetical order for your interface language. Labels show support even if a feature is disabled or its data has not been downloaded. Text-to-speech depends on voices installed on your device and does not affect the order.

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
