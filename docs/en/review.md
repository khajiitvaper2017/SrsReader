# Study and saved words

Open **Study** to see your learning languages and frequency decks. The table shows new, learning, and due cards within your daily limits. Select a language to review all its words. Select a deck to review only that deck. **Back to decks** ends the session. Each word belongs to one group. Daily limits apply to the language.

Select **Mined words** under a language to review words you saved or rated while reading. Frequency imports do not add words to this deck. Mining a word from a frequency deck moves it to Mined words without resetting its progress. Click anywhere in a language or deck row to start reviewing.

Manage the list under **Settings → General → Studied languages**, or use **Add language** in Study. Reading detects any listed language automatically. Review sessions contain one language each, so you can study different languages in separate tabs. Removing a language from the list keeps its words, decks, and progress.

## Frequency decks

1. Select **Add frequency deck**.
2. Select a language and an installed, enabled frequency dictionary with ranks, where lower ranks mean more frequent words.
3. Enter how many entries to include, from 1 to 10,000.
4. Enter a deck name, or leave it empty for an automatic name.
5. Select **Add frequency deck**.

The deck checks the first N unique entries that contain letters. Punctuation, symbols, and number-only entries are skipped. These entries are also hidden in existing frequency decks. Words already saved, words in other decks, and words without definitions in your enabled dictionaries are skipped. It can contain fewer than N words. All added cards start as new words. Existing schedules and mastered words stay unchanged. Install dictionaries in **Settings → Dictionaries**.

After an app or dictionary update, open the deck’s three-dot menu in **Study** and select **Refresh deck**. This rebuilds the deck with its original word limit and the current frequency dictionary. It removes entries that do not pass the word filters and updates definitions. New matching words start as new cards. Review history, custom definitions, mastered words, and suspended words are kept. Words you mined stay in **Mined words**. Removed words keep their saved progress if they return in a later refresh.

## Browse words in a deck

In **Study**, open a deck’s three-dot menu and select **View words**. The **Words** page opens with that language and deck selected.

Use **Language** and **Deck** to browse another group. **All decks** combines mined words and frequency decks without duplicates. The list includes mastered and suspended words. Browsing a language does not change your studied-languages list or other review sessions. Search by word or reading and use the status filter to narrow the list. Lists show 50 words per page. Select a word to open its details and edit its definition, mastery, suspension, or retention setting.

## Clear or delete a deck

Open the three-dot menu at the end of a deck row in **Study**.

- **Clear deck** deletes all words in that deck, their review history, and downloaded recordings. This includes mastered and suspended words. The empty deck remains in the list. Use this action to empty **Mined words**.
- **Delete deck** also removes the frequency deck from the list.

Confirm the action in the dialog. These actions cannot be undone. Cached sentences, dictionaries, and words in other groups are kept. Export **Words & progress** in **Settings → Backups** if you want a copy first.

## Sentences from reading

Review sentences come from the permanent cache of texts you have parsed. Each sentence has more than four words. With **Settings → Reading → Use UDPipe** enabled, sentences with a different part of speech for the target word are excluded. If a sentence contains several matches, a matching occurrence is used. Sentences where all words except the target word are known come first. If none are available, sentences with fewer other unknown words come next. Mark words as mastered to improve this selection. Parse more pages to add examples. Sentences and their translations stay in the reading cache, not in cards.

## Review session

Select a language or deck. Choose **Word** or **In context**. Press **Show answer** or **Space**, then rate your answer with **Again**, **Hard**, **Good**, or **Easy**. The default grading keys are **1–4**. After revealing the answer, **Space** grades Good. Day-based intervals are shown as study days, not hours until rollover. The next review date shows no time for these cards. Learning steps within a day still show minutes or hours. Button intervals are estimates for the time shown. RWKV also uses answer duration, so the interval can change before you answer.

**Undo last review** undoes the latest answer across all tabs. It restores the schedule and lapse count. Later edits to definitions and cached translations stay in place. Undone answers remain in the backup history but do not count as reviews.

## Review controls

Open **Settings → Controls → Review controls**. Each action has one binding. Select its input, then press a key or mouse button over it. You can include Ctrl, Alt, Shift, or Meta. Escape cancels capture. Tab moves to the next input. Select the clear button to disable a binding. Each review action must have a different binding.

| Action                   | Default |
| ------------------------ | ------- |
| Again                    | 1       |
| Hard                     | 2       |
| Good                     | 3       |
| Easy                     | 4       |
| Show answer / Grade Good | Space   |
| Undo                     | Z       |

Number keys work on the main keyboard and numeric keypad. In study sessions, **Show answer / Grade Good** reveals the answer first and grades Good on the next press. In lookup popups, the answer is already visible, so it grades Good. **Undo** restores the latest review. Bindings do not run while you use an input, button, link, menu, or dialog. Holding a key does not repeat the action. **Use only Again and Good** disables the Hard and Easy bindings.

## Queue counts, statistics, and upcoming reviews

The review header shows New, Learning, Relearning, and Review cards ready in the current queue. Learning and Relearning include cards available through learn-ahead. A note shows how many are available early. The card badge shows its current phase. Reviewed today counts answers, including repetitions of the same card and ratings while reading.

Choose **Statistics language** below the language list to view one language’s figures. The yearly calendar shows past answers in your accent color. Scheduled days use gray shades that are distinct from empty days. Their tooltips show the number of scheduled cards. Higher counts look darker in light mode and lighter in dark mode. Hover, focus, or tap a day to see its date and count. Use the arrow keys to move between days. The year controls show the previous year, current year, or next year. The figures below the calendar cover the full review history for this language. Daily average counts only days with review activity. Days learned is the share of days with activity since the first review. The current streak allows today to be unfinished. Days without reviews break a streak. Undone answers do not count.

Open **Statistics** below the calendar to see saved-word counts and results for the last 30 study days. Recall measures successful answers on normal Review cards. It excludes learning, relearning, and undone answers. Study time includes only answers with a recorded duration.

Open **Upcoming reviews** and choose **7 days** or **30 days**. The forecast counts each active scheduled card once at its current due date. Overdue cards appear under today. New, mastered, and suspended cards are excluded. The forecast does not apply daily limits or predict additional repetitions after future answers. All dates use your study-day rollover.

## Scheduling

Open **Settings → Review**.

- **Scheduling algorithm:** FSRS is the default. Select **RWKV w64 (SM55)** to download its model from GitHub and prepare your review history. Keep the page open until preparation finishes. You can resume interrupted preparation later. Both algorithms work offline. Switching algorithms opens a confirmation dialog. Choose **Switch and reschedule** to apply the model and recalculate dates for all review cards in all languages, including suspended and mastered cards. New and learning cards keep their current steps. Review history stays unchanged. Interrupted rescheduling resumes when you next use reviews.
- **RWKV scheduling mode:** available when RWKV is selected. **Curve** is the default. It uses the forgetting curve saved after an answer. **Instant** queries recall at future review dates to find an interval for your desired retention. It can take longer. Both modes work offline and use the same review history. Switching modes does not require another download or rebuild. Switching modes opens the same confirmation dialog and automatically recalculates review dates in all languages. In Instant mode, a card already below the target can become due today. The search ends at the Curve interval. If no sampled date reaches the target sooner, Instant uses that interval. Curve is the recommended mode for scheduling. After a model update, RWKV downloads the current model and prepares its state from your saved history. Review dates are recalculated automatically for the new model, including unusually long intervals.
- **Desired retention:** default 80%; accepts 70–99%. Higher values usually mean more reviews. Existing profiles keep their saved value.
- **Use only Again and Good:** hides Hard and Easy. New profiles show all four answers.
- **Mature interval (days):** default 28. A scheduled interval below this value is Young. An interval at or above it is Mature. This does not depend on the age of the word.
- **Default card front:** show the word alone or in its sentence.
- **Show sentence translations:** show translations after revealing the answer.

### Display order

Open **Settings → Review → Display order**. These settings apply to every language and deck. They control which cards enter the queue and how they appear.

**Choose new words** picks which words fill your daily limit:

- **Most common first** is the default. It picks more frequent words first, using combined ranks from enabled dictionaries. **Words without frequency** controls words with no matching rank.
- **Deck, then oldest first** starts with Mined words, then frequency decks in name order. Within each deck, older additions come first.
- **Deck, then random** uses the same deck order and selects words at random within each deck.
- **Oldest added first** and **Newest added first** use the date the word was added.
- **Random** selects words at random across the selected language or deck.

**Order chosen words** controls how the picked words appear. **Keep chosen order** keeps the order from the first setting. **Random** shuffles the same words. To study by frequency, choose **Most common first**, then **Keep chosen order**.

**New/review order** accepts **Show before reviews**, **Mix with reviews**, or **Show after reviews**. The default is **Mix with reviews**. This places new cards relative to regular reviews and interday learning cards.

**Interday learning/review order** uses the same three choices. It places learning and relearning steps that crossed a study-day boundary relative to regular reviews. The default is **Mix with reviews**. These learning cards receive space in the daily review limit before regular reviews, regardless of their display order.

**Review sort order** sorts regular reviews before the daily review limit:

- **Due date** puts earlier due dates first.
- **Due date, then random** shuffles cards due on the same study day.
- **Due date, then deck** groups cards due on the same study day by deck.
- **Deck, then due date** groups cards by deck, with earlier due dates first within each deck.
- **Shortest intervals first** and **Longest intervals first** use each card's scheduled interval.
- **Random** is the default. It shuffles all due review cards.

Deck order starts with Mined words, then frequency decks by name. Random order stays stable within the study day and changes at the next day boundary. Mix preserves the order within each group and chooses between groups in proportion to their remaining cards. Due same-day learning steps always come first. Each word has one card, so there are no card-type or sibling ordering options.

### Learning and review days

**Learning steps** and **Relearning steps** accept positive durations separated by spaces. Use `m` for minutes, `h` for hours, and `d` for days. For example, `1m 10m` uses two steps. Leave the field empty to use model intervals. Both lists default to `10m`.

Again returns to the first step. Good advances or finishes learning. Easy finishes learning immediately. Hard repeats the current step, except on the first step where it uses a longer delay. With a single `10m` step, a new card answered Good goes directly to normal review. Again gives 10 minutes. Hard gives 15 minutes.

**Minimum review interval** accepts whole days from 1 to 36,500. Normal reviews become due at the start of their scheduled study day. Learning steps can occur within the day. A step that crosses rollover becomes due at the start of its target day.

**New study day starts at** accepts an hour from 0 to 23. The default is 4, in your device's local time zone. Daily counts and limits use this boundary, including across daylight saving changes.

**Learn-ahead limit** defaults to 20 minutes. When no other work is available, learning cards can appear this many minutes early. With a 10-minute step and a 20-minute limit, a card can appear again immediately. Set 0 to wait until it is due. The algorithms always use the actual answer time.

### Daily workload

**New words per day** defaults to 20 and accepts 0–10,000. A word counts once when first studied. **Maximum daily reviews** is unlimited when empty. A review limit also stops new introductions. Same-day learning steps remain available.

Limits apply separately to each study language. Ratings while reading remain available after reaching a limit. They still update memory and daily counts.

Enable **Spread review intervals slightly** to distribute normal review dates. It does not change learning steps.

## Dynamic desired retention

Enable **Set retention by word frequency rank** to use frequency rules with either algorithm. Select dictionaries that contain ranks, where 1 means the most frequent word. Do not select dictionaries that contain occurrence counts. Known Leipzig rank dictionaries are selected by default. Matching selected ranks are combined using their harmonic mean.

The default targets are 90% up to rank 1,000, 85% up to 5,000, 80% up to 20,000, and 75% for higher ranks. You can add or remove ranges and save new limits and targets. Limits must increase. Targets accept 70–99%. Words without a rank use global retention.

In **Words**, set **Retention for this word** to override the rules. Leave it empty for automatic retention. A word override also works when frequency rules are off.

Settings affect future answers. To apply current retention and interval settings to existing cards, use **Maintenance → Reschedule existing cards**. Choose the language with **Language-specific settings**. This affects active Review cards in that language. It skips new, learning, mastered, and suspended cards. It does not add reviews or advance memory. Overdue cards can remain overdue.

## Leeches and saved words

A leech is a word you repeatedly forget. The default threshold is eight lapses. Only Again from normal Review counts as a lapse. Repeated Again during relearning does not add lapses. Choose **Suspend** or **Mark only**. Set the threshold to 0 to disable detection. With threshold eight, detection repeats at 12, 16, and later matching lapses after you resume a word.

Use the **Leeches** filter in **Words** to find marked words. Word details show lapse counts. You can edit definitions, change retention, or delete a word and its history.

**Master** excludes a word from SRS while preserving its history. **Unmaster** restores its schedule. **Suspend** pauses review until **Resume**. Neither action resets memory.

Cards use current entries from your enabled dictionaries. Their order and **If needed** settings also apply to cards. When sentence parsing is enabled, definitions use the sentence’s part of speech and grammar, as in popups. Use **Show more** to reveal excluded meanings. Use the eye button to hide a dictionary for one card. Hidden dictionaries appear below visible ones. These choices are remembered for that word in cards and popups.

The frequency badge beside the word shows its rank from enabled frequency dictionaries. Select it to see the individual ranks.

Use **Add custom definition** (+) to add a definition. Use the pencil beside a dictionary definition to save a custom override. Both appear in popups too. **Restore dictionary definition** removes an override. **Refresh from dictionary** refreshes saved dictionary entries and keeps your custom definitions and overrides.

The sentence’s translation, speaker, and next-example buttons sit beside it.

Use **Maintenance → Rebuild RWKV state** to rebuild its cache from saved answers. This does not change due dates or remove history.

Editing a definition keeps the word in its current deck. Custom dictionary edits remain available when a dictionary update changes the original definition.
