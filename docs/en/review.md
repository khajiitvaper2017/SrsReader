# Review and saved words

Open **Review**. Choose **Word** or **In context**. Press **Show answer** or **Space**, then rate your answer with **Again**, **Hard**, **Good**, or **Easy**. The keys are **1–4**. Button intervals are estimates for the time shown. RWKV also uses answer duration, so the interval can change before you answer.

**Undo last review** undoes the latest answer across all tabs. It restores the schedule and lapse count. Later edits to definitions, sentences, and translations stay in place. Undone answers remain in the backup history but do not count as reviews.

## Queue counts, statistics, and upcoming reviews

The review header shows New, Learning, Relearning, and Review cards ready in the current queue. Learning and Relearning include cards available through learn-ahead. A note shows how many are available early. The card badge shows its current phase. Reviewed today counts answers, including repetitions of the same card and ratings while reading.

The yearly calendar below the review card shows past answers in your accent color. Scheduled days use gray shades that are distinct from empty days. Their tooltips show the number of scheduled cards. Higher counts look darker in light mode and lighter in dark mode. Hover, focus, or tap a day to see its date and count. Use the arrow keys to move between days. The year controls show the previous year, current year, or next year. The figures below the calendar cover the full review history for this language. Daily average counts only days with review activity. Days learned is the share of days with activity since the first review. The current streak allows today to be unfinished. Days without reviews break a streak. Undone answers do not count.

Open **Statistics** below the calendar to see saved-word counts and results for the last 30 study days. Recall measures successful answers on normal Review cards. It excludes learning, relearning, and undone answers. Study time includes only answers with a recorded duration.

Open **Upcoming reviews** and choose **7 days** or **30 days**. The forecast counts each active scheduled card once at its current due date. Overdue cards appear under today. New, mastered, and suspended cards are excluded. The forecast does not apply daily limits or predict additional repetitions after future answers. All dates use your study-day rollover.

## Scheduling

Open **Settings → Review**.

- **Scheduling algorithm:** FSRS is the default. Select **RWKV w64 (SM55)** to download its model from GitHub and prepare your review history. Keep the page open until preparation finishes. You can resume interrupted preparation later. Both algorithms work offline. Switching algorithms keeps current due dates.
- **RWKV scheduling mode:** available when RWKV is selected. **Curve** is the default. It uses the forgetting curve saved after an answer. **Instant** queries recall at future review dates to find an interval for your desired retention. It can take longer. Both modes work offline and use the same review history. Switching modes does not require another download or rebuild. It affects future answers. Use **Maintenance → Reschedule existing cards** to apply the selected mode to current Review cards. In Instant mode, a card already below the target can become due today. The search ends at the Curve interval. If no sampled date reaches the target sooner, Instant uses that interval. Curve is the recommended mode for scheduling. After a model update, RWKV downloads the current model and prepares its state from your saved history. Use **Reschedule existing cards** to recalculate saved due dates, including unusually long intervals.
- **Desired retention:** default 80%; accepts 70–99%. Higher values usually mean more reviews. Existing profiles keep their saved value.
- **Use only Again and Good:** hides Hard and Easy. New profiles show all four answers.
- **Mature interval (days):** default 28. A scheduled interval below this value is Young. An interval at or above it is Mature. This does not depend on the age of the word.
- **Default card front:** show the word alone or in its sentence.
- **Show sentence translations:** show translations after revealing the answer.

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

Settings affect future answers. To apply current retention and interval settings to existing cards, use **Maintenance → Reschedule existing cards**. This affects active Review cards in the current language. It skips new, learning, mastered, and suspended cards. It does not add reviews or advance memory. Overdue cards can remain overdue.

## Leeches and saved words

A leech is a word you repeatedly forget. The default threshold is eight lapses. Only Again from normal Review counts as a lapse. Repeated Again during relearning does not add lapses. Choose **Suspend** or **Mark only**. Set the threshold to 0 to disable detection. With threshold eight, detection repeats at 12, 16, and later matching lapses after you resume a word.

Use the **Leeches** filter in **Words** to find marked words. Word details show lapse counts. You can edit definitions and sentences, change retention, or delete a word and its history.

**Master** excludes a word from SRS while preserving its history. **Unmaster** restores its schedule. **Suspend** pauses review until **Resume**. Neither action resets memory.

**Refresh from dictionary** replaces saved definitions with current dictionary entries. Updating a dictionary does not replace card definitions automatically.

Use **Maintenance → Rebuild RWKV state** to rebuild its cache from saved answers. This does not change due dates or remove history.
