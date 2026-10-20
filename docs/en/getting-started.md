# Getting started

1. Choose your **Study language** and confirm your **Native language**. The native language is suggested from your browser and is used for translations.
2. Under **Dictionaries**, import a dictionary for your study language. The [dictionary guide](dictionaries.md) explains the available downloads.
3. Choose a lookup control, such as **Middle mouse** or **Shift + hover**. None is selected by default.
4. Choose **Finish setup**. Available word forms and example sentences download for your study language.

Open a website, use your lookup control on a word, and choose **Mine word**. Open **Review** to study saved words.

Change languages under **Settings → General → Languages**. **Interface language** offers English, Ukrainian, or **Same as native language**; other native languages use the English interface. You can reopen setup from **Settings → General**. **Docs** stays available during setup.

## Appearance

Open **Settings → General → Appearance**. Choose **Light**, **Dark**, **OLED (black)**, or **System** to follow your device. Dark uses near-black surfaces. OLED uses black backgrounds. Both keep secondary labels close to the main text color.

**Accent color** sets the color for buttons, links, and selected controls. The default is orange (`#D26400`). Use the color picker or enter a six-digit hex code, such as `#0080FF`. The theme and accent also apply to dictionary popups.

## Load a build

- **Chrome:** open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `.output/chrome-mv3`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `.output/firefox-mv3/manifest.json`.

Firefox temporary add-ons are removed when Firefox closes. Keep [backups](data.md); a permanent installation requires a signed package.
