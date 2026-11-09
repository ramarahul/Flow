# Flow visual design guide

This is the baseline for Flow's interface. Use it before changing UI components.
It records the existing violet-and-ivory identity; it is not a new palette proposal.
The matching color tokens are in `src/style.css`.

## Direction

Calm, compact, and easy to understand. The timer is the main action. Supporting
screens should help people choose a task or understand their time without adding
dashboard clutter. Use typography, spacing, and consistent states instead of
decorative illustrations, rewards, or gamification.

Keep the popup 300px wide. Do not enlarge it to accommodate controls. Show important
actions with words; an unfamiliar icon alone is not sufficient for task editing.

## Color roles

Use colors by role, not by choosing a new shade for each screen.

| Role             | CSS token                               | Light appearance      | Usage                                      |
| ---------------- | --------------------------------------- | --------------------- | ------------------------------------------ |
| Canvas           | `--bg`                                  | `#e4dcfa`             | Overall lavender background                |
| Surface          | `--surface`                             | `#f7f2ff`             | Unselected cards and controls              |
| Text             | `--ink`                                 | `#3b2e56`             | Headings and readable body text            |
| Secondary text   | `--muted`                               | `#65587d`             | Supporting labels and metadata             |
| Divider          | `--line`                                | `#c5b5e1`             | Borders and separation                     |
| Accent           | `--accent`                              | `#7052b5`             | Focus outlines, progress, and text actions |
| Soft accent      | `--soft`                                | `#d6c9ef`             | Existing subtle highlights                 |
| Destructive      | `--danger`                              | `#a13d5d`             | Delete actions and errors                  |
| Selection        | `--selection-start` / `--selection-end` | `#7656b2` → `#60418f` | Selected task only                         |
| Selected text    | `--selection-ink` / `--selection-muted` | `#ffffff` / `#f1e9ff` | Text on a selected task                    |
| Timer surface    | `--timer-top` / `--timer-bottom`        | `#fffefa` → `#f3edf7` | Large ivory start button                   |
| Timer text       | `--timer-ink` / `--timer-muted`         | `#49375f` / `#6d5a80` | Timer digits and labels                    |
| Warm action      | `--action-bg` / `--action-hover`        | `#ffd6b1` / `#ffe4ca` | Existing primary save/session controls     |
| Warm action text | `--action-ink`                          | `#49345d`             | Text on those warm controls                |

The warm accent is already part of existing save/session controls. Do not spread it
to every card, task action, or chart. The timer stays ivory. Ordinary New task and
Edit task actions use the surface/accent roles, not a new dominant color.

Only the timer, selected task, and existing Today summary use subtle gradients.
Keep graphs within the violet family. Do not add blue, green, gold, or another
palette as an isolated visual experiment.

### Dark appearance

The same roles are overridden in the explicit dark theme and the system-dark
media query. Keep these two overrides synchronized.

| Token       | Dark appearance |
| ----------- | --------------- |
| `--bg`      | `#28203c`       |
| `--surface` | `#382e4d`       |
| `--ink`     | `#f7efff`       |
| `--muted`   | `#d2c2e6`       |
| `--line`    | `#5a496f`       |
| `--accent`  | `#e5baff`       |
| `--soft`    | `#4c3b64`       |
| `--danger`  | `#ffc4b7`       |

Ivory timer surfaces retain their own dark text. Selected violet surfaces retain
their own white text. Do not inherit the dark-theme body text on a light hero card.

## Typography and spacing

- Keep the existing local font stack: Trebuchet MS, Segoe UI, Arial, sans-serif.
  No downloaded fonts.
- Timer digits are the dominant type. Page headings are approximately 23–24px,
  card titles 12–13px, and supporting text 10–12px.
- Use tabular digits for time and statistics. Wrap long task names rather than
  hiding important information or widening the popup.
- Use the established 4, 8, 12, 16, and 24px spacing rhythm. Preserve the existing
  18px task-list gaps and 24px horizontal popup padding.
- Standard cards have 16px corners; small controls use 8–10px; larger summaries
  use 24px; the timer uses 28px. Do not invent a new radius for every control.
- Give text actions usable targets of at least 36px high, normally 40–44px for
  prominent actions. Avoid tiny unlabeled arrows or icon-only management toggles.
- Keep transitions brief, around 160–180ms. Respect reduced-motion settings.

## Component rules

### Home

The task selector sits above one large ivory timer button. Starting focus happens
by clicking the time itself. The optional duration selector stays below it. Do not
add a second competing start action or decorative progress metaphor.

Show task on home is enabled by default. Turning it off removes the task selector
and its goal progress without reserving empty space or changing the selected task.
The header's Today's goals action remains available. Reuse the existing Settings
toggle style and explain that hiding a task does not stop its time attribution.

### Tasks

Keep selection lightweight: New task above the list, an Archived tasks text link,
and Quick Focus as the permanent default. No full-width management toolbar, filter
tabs with counters, or repeated Rename/Archive/Delete action bars.

Each custom row has one visible **Edit task** text button, separate from its task
selection button. Choosing a task selects it; Edit task opens its details. Never
nest buttons. Show the selected task with the established violet fill and a check,
not only a check on an unchanged surface.

The editor contains the task name, goal settings, and labeled **Archive task** and
**Delete task** actions. Deletion needs a separate confirmation that explains what
happens to history and a running timer. Quick Focus has no edit or delete action.
Do not replace clear labels with an unexplained sliders icon or ellipsis menu.

### Statistics

Use the existing full-width Back to timer control, an ivory Today card, a violet
graph, and compact supporting totals. Keep the graph ahead of secondary metrics.
Use one Week / Month / Year selector and explicit date ranges. Weeks start Monday;
week/month bars represent days, and year bars represent months. Graph totals and
Focus by task use the same period and navigation. Do not add a separate date picker
or independent period selector to the task breakdown. Mark future buckets as
upcoming with dashed tracks and text, rather than treating them as missed focus.
Keep Today and clearly labeled all-time summaries separate from the selected
period. All sessions remains an all-history list with years included in dates.
Expand older history progressively; do not render a wall of session cards or
introduce competing chart colors.

### States and feedback

Selection must change both appearance and accessible state. Keyboard focus must
remain visible. Disabled controls must not look actionable. Errors use the danger
role plus explanatory text. Never use color alone to communicate an error or
selection. Preserve meaningful labels and confirmation behavior.

## How to change the design

1. Identify the user problem and the existing component/role that should solve it.
2. Make the smallest coherent change. A task usability fix should not recolor the
   timer or redesign statistics.
3. Reuse CSS tokens. If a new role is truly needed, document it here and add its
   token before using it; avoid isolated hexadecimal choices in feature CSS.
4. Check the actual 300px popup, long task names, empty/selected/archived states,
   keyboard use, and both themes. Compare before/after screenshots.
5. Verify the affected interactions in tests and update this guide when the design
   contract changes. Do not overwrite unrelated user work to revert a UI experiment.

Product behavior is documented separately in [README.md](../README.md). Release
checks are in [TESTING.md](TESTING.md).
