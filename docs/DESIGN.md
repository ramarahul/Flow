# Flow visual design guide

This is the baseline for Flow's interface. Use it before changing UI components.
It records the existing violet-and-ivory identity; it is not a new palette proposal.
The matching color tokens are in `src/style.css`.

## Direction

Calm, compact, and easy to understand. The timer is the main action. Supporting
screens should help people choose a task or understand their time without adding
dashboard clutter. Use typography, spacing, and consistent states instead of
decorative illustrations, rewards, or gamification.

Keep the timer home screen at 300px wide by 340px tall, matching the user's reference.
Other pages retain the 300px width but size naturally to their content, with a
400px cap on their scrollable panels. Never derive panel height from the popup
viewport. The home screen uses the remaining flex area within its fixed frame.
Keep menus fully visible. Use words for
unfamiliar management actions. The task-edit pencil is an intentional icon-only
control, with a hover tooltip and accessible name explaining its purpose.

## Voice and wording

Flow sounds calm, natural, and direct. Use short sentences and everyday words.
Use the name sparingly: “In flow” can label the running timer, but keep actions
literal, such as “Take a break”, “Repeat session”, and “Delete task”. Never turn
task names, statistics, or destructive actions into metaphors.

Prefer helpful context over slogans. Explain what happens next, especially when
time stops, a session ends, or data is deleted. Avoid pressure, praise, rewards,
technical terms such as “focus target”, and decorative dashes in headings.
Keep labels consistent across the popup, notifications, and blocked websites.
Show the installed version in the Settings footer using
`chrome.runtime.getManifest().version`; never hardcode it.
The timer circle groups the selected task, centered time, and one daily summary.
Settings labels say “Default focus duration” and “Default break duration” so
people understand these values apply to future sessions.
The default task is “General”. Its supporting text shows time recorded today. Use “Add task”
for creation. Do not add instructions about editing tasks; the pencil's tooltip
and accessible name explain its action.

Use one labeled Menu disclosure for Timer, Tasks, Statistics, and Settings.
Keep it closed initially and close it on selection, Escape, and outside clicks.
Show the Flow wordmark only on the timer. Secondary pages use their title in
the same header position: Your Tasks, Your Focus, and Your Flow (Settings).
Do not stack a page title beneath the wordmark or introduce a large back bar.
Both task entry points open the same screen. The task editor alone has a compact
Back to tasks control and a secondary heading. Empty statistics describe the
missing data; direct people to Timer in the menu rather than saying a session
starts on the statistics page.

## Color roles

Use colors by role, not by choosing a new shade for each screen.

| Role             | CSS token                        | Light appearance      | Usage                                      |
| ---------------- | -------------------------------- | --------------------- | ------------------------------------------ |
| Canvas           | `--bg`                           | `#e4dcfa`             | Overall lavender background                |
| Surface          | `--surface`                      | `#f7f2ff`             | Unselected cards and controls              |
| Text             | `--ink`                          | `#3b2e56`             | Headings and readable body text            |
| Secondary text   | `--muted`                        | `#65587d`             | Supporting labels and metadata             |
| Divider          | `--line`                         | `#c5b5e1`             | Borders and separation                     |
| Accent           | `--accent`                       | `#7052b5`             | Focus outlines, progress, and text actions |
| Soft accent      | `--soft`                         | `#d6c9ef`             | Existing subtle highlights                 |
| Destructive      | `--danger`                       | `#a13d5d`             | Delete actions and errors                  |
| Task selection   | `--task-selected-bg`             | Soft accent tint      | Selected task card                         |
| Summary surface  | `--timer-top` / `--timer-bottom` | `#fffefa` → `#f3edf7` | Today summary gradient                     |
| Home timer       | `--ink` / `--muted`              | Canvas text           | Open digits and invitation                 |
| Warm action      | `--action-bg` / `--action-hover` | `#ffd6b1` / `#ffe4ca` | Existing primary save/session controls     |
| Warm action text | `--action-ink`                   | `#49345d`             | Text on those warm controls                |

The warm accent is already part of existing save/session controls. Do not spread it
to every card, task action, or chart. The home timer sits directly on the canvas. Ordinary Add task and
Edit task actions use the surface/accent roles, not a new dominant color.

The Today summary uses a subtle gradient. Task selection uses a soft accent tint
and a quiet accent border.
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

In dark appearance, the Today summary uses deep plum gradients
(`#453657` to `#382c4b`) with pale text (`#f7efff`) and muted lavender captions
(`#d2c2e6`). The home timer uses timer text roles inside its circle in both themes.
Warm actions use muted rose-plum (`#68465b`, hover
`#78546a`) with pale warm text. The canvas wash is a faint violet, not peach.
Apply these roles to explicit dark and system-dark equally, including hover and
press states. Never leave large white or ivory cards in dark mode. Selected
task cards retain the normal text role over a soft accent tint. Light appearance keeps its existing palette.

## Typography and spacing

- Keep the existing local font stack: Trebuchet MS, Segoe UI, Arial, sans-serif.
  No downloaded fonts.
- Timer digits are the dominant type. Page headings are approximately 22px,
  card titles 12–13px, and supporting text 10–12px.
- Use tabular digits for time and statistics. Wrap long task names rather than
  hiding important information or widening the popup.
- Use the established 4, 8, 12, 16, and 24px spacing rhythm. Use 10px task-list gaps,
  12px vertical popup padding, and 16px horizontal padding.
- Cards and summaries have 12px corners; small controls use 8?10px; the timer
  start action is a 220px circle. Reuse these radii rather than adding variants.
- Give text actions usable targets of at least 36px high, normally 40–44px for
  prominent actions. Avoid tiny unlabeled arrows or icon-only management toggles.
- Use the solid, fluid interaction style: opaque surfaces, soft elevation, and
  brief 180ms ease-out transitions using the shared motion tokens. The home timer
  stays still on hover and press; a soft pool of light inside the circle provides feedback.
  Keep the original ivory/plum surface, brighten the upper center with a feathered
  radial highlight over a uniform 6% accent state layer so both halves respond.
  Fade this interior layer in and out using the shared 180ms ease-out transition;
  reduced motion applies it immediately. Keep the underlying gradient and daily goal fill.
  A feathered 130px-radius light follows mouse position inside the idle start
  button using CSS properties, without React state updates or moving content.
  Default its center to 50% across and 42% down. Reduced motion keeps this center
  fixed; touch does not track a light. Fade it out when the pointer leaves.
  Use white for the light highlight
  and pale lavender at 22% in both dark modes.
  Keep its resting border unchanged on hover and press, and retain the keyboard focus outline.
  Screens and countdowns appear immediately, without entrance animation,
  translation, scaling, or bouncing. The navigation menu unveils from top to bottom
  over 220ms with a soft opacity change and a gentle chevron turn, without moving
  or resizing its panel. Finish the reveal immediately when an item gains keyboard
  focus. Reduced motion shows it instantly. Switch knobs stretch briefly while pressed.
  Avoid hard pedestal shadows. Frosted glass is used only on the Tasks surfaces
  described below; other screens and blocking overlays keep opaque surfaces.
  Reduced-motion mode removes transitions, stretching,
  compression, and corner changes.

## Component rules

### Pointer response

Mouse movement pushes a damped surface field that changes light and violet shading
across the background and inside controls. Preserve the original vigorous wave
response: direct pointer pressure and lively outward propagation. Do not replace
it with heavy damping, directional transport, or a smoothed trailing current.
Use one faint, pointer-transparent
canvas above the surfaces. Boxes, text, and hit targets remain stationary; never
translate them, distort glyphs, blur content, or emit rings/particles. Keep the
existing button press feedback separate. Use a coarse bounded simulation, no
React updates per movement, and stop rendering once the surface settles (at most
180 frames after movement). Settings includes **Liquid surface effect**, enabled
by default and saved locally. Turning it off removes the canvas and its listeners
immediately. Reduced motion and touch disable and clear the effect too. This
belongs to the popup only, never the website blocking overlay.

### Home

Keep the idle and running popup at 300px by 340px. Avoid promotional
headings and extra vertical breathing room. Preserve the original lavender home
canvas (`--bg`, light `#e4dcfa`) with the warm wash anchored at the top, fading at
70%. Do not replace it with the paler card/surface role. Both idle and running
states use this canvas, with the matching deep background role in dark mode.
Center a single 220px circular start action within the 220px timer area.
Use three groups: an independent task button at the top, dominant 56px timer
digits in the middle, and one 11px daily summary below. Show "Today 30m" without
a scheduled goal or "Today 30m ? Goal 1h" with one. Keep accessible daily-goal
progress and a small checkmark when reached. Do not add a separate elapsed-time
line. Idle digits have no adjacent play icon. The circle's accessible name and
"Click to start focus" tooltip explain its action. Task names sit in a centered text-only selector with a quiet "Task" label above
the name and a "Change task" tooltip. Keep task selection and starting focus as sibling buttons.
Only the task name opens a compact inline task dropdown. Do not add a chevron or side icon. Keep
its hit target fitted to the text, at least 28px high and at most 148px wide;
the status label above it does not intercept timer clicks. The dropdown selects
tasks immediately without leaving the timer; include General, active tasks,
selection feedback, and a separate Manage tasks link. Keep its options bounded
and scrollable inside the popup. Escape and outside clicks dismiss it; arrow keys
navigate its controls. Dismissing by clicking the circle must not start focus.
Preserve keyboard focus when selecting or dismissing, and keep errors visible.
Do not add a visible border, box, or underline, including on hover or press.
Preserve the keyboard focus outline and the "Change task" tooltip.
Center the task name beneath its status label. Use normal digit tracking
and reserve scrollbar space on both sides of timer content so its center stays
at 150px even when extra content scrolls.
For a task with an enabled goal scheduled today, fill the circle from bottom to
top using the soft accent role. Fill height represents today's actual task time
divided by the daily target, capped at 100%; it is independent of session duration.
Keep the text above the fill and preserve its contrast in both themes. Use a flat,
still surface with no waves, looping animation, or added ring. Tasks without a
scheduled goal and the hidden-task view retain the original surface. Reaching a
session target does not reset daily progress. Keep the accessible goal value and
text summary alongside the visual fill.
Use shared grid rows and stable group positions across idle and running states.
Pressing the timer applies a slight accent tint (14%) immediately, without any
movement or scaling. Keep that tint while the start request is pending, with the
circle fully opaque, then return to the normal running surface. Tint the whole
surface above any daily-goal fill and below the text. Keep disabled styling for
invalid durations and retain keyboard focus indicators. No temporary text is needed.
Keep the idle label unchanged while start is pending; disable the button and
mark it busy without displaying temporary starting text. Once persisted, show "FOCUSING"
with a small static accent dot in place of "Task". Keep this confirmation visible
throughout the countdown and announce the label change politely to screen readers.
On failure, restore the idle label and enabled button and show the existing error.
Do not add an extra heading, modal, pulse, sound, or change in circle geometry.
Completion, overtime, and break
states retain a short status above the task name so their meaning stays clear.
Hiding tasks removes the task label without changing the 220px circle size or
center. Keep 56px digits and preserve the same geometry when running. Menu > Tasks remains available. Preserve the fixed
300px by 340px home frame and existing bounded scrolling.

### Running countdown

Preserve the same circle, size, position, type, and surface when starting focus.
The start button becomes a noninteractive timer circle. Its label changes to
the current state, the time begins counting down, and the start cue becomes
a single daily summary when tasks are shown. Keep the task selector inside the upper part of the circle in both states.
Do not replace the circle with a linear progress bar or move the timer when it starts.
Break, completion, and overtime states reuse the circle too; secondary explanations
and permitted session actions appear below it.

The countdown is not a button. Do not add pause, finish, extension, or break controls
during the protected countdown. No blinking, pulsing, rotating decoration, or
continuous attention-seeking animation. All feedback respects reduced motion.

### Continuity between states

Design and review idle, running, completion, overtime, and break states together.
An action should preserve the visual object the user interacted with, its spatial
anchor, and the established interaction model. Change only what the new state
requires. Do not introduce a new progress metaphor, rearrange unrelated controls,
or enlarge the popup simply because a session has started. Verify continuity with
before/after bounds and rendered screenshots, alongside accurate timer values.

### Tasks

Selecting a task switches immediately and returns to Timer without confirmation.
Preserve the timer deadline and session identity; only future focus time uses the
new task, with past intervals retaining their original attribution.
Keep selection lightweight: Add task above the list, an Archived tasks text link,
and General as the permanent default. No full-width management toolbar, filter
tabs with counters, or repeated Rename/Archive/Delete action bars.

Use a two-column grid of compact square cards: 12px corners,
12px gaps, 8px vertical and 12px horizontal padding, and a minimum 124px card height. Cards use
`--task-glass-surface` or `--task-glass-selected`, a quiet glass border,
luminous top and side edges, and a soft depth shadow. Use a smooth tint without diagonal reflections. A 12px backdrop blur softens only
the page background behind each card; never blur the text or controls.
The Tasks page uses a cohesive cool violet scheme: a pale lilac canvas in light
mode and deep ink-violet in dark mode. Page-wide violet light pools provide colour
behind transparent cards without a container box. Clipchamp-inspired #814ee9 is
the selection tint and source of the background light. Neutral translucent cards,
glass Add task control, and theme-specific text tokens keep the surfaces readable.
Keep the page visible through the tinted base and controls opaque.
Cards sit directly on the page, with no shared background box behind the grid.
Selected cards retain an accent border and 12px check; no rotation or fanning.
Place the task name and goal metadata at the top. Today's duration sits at the
bottom left, with its caption below; the separate 44px pencil target is at the
bottom right. Reserve its space so long durations cannot overlap it. Cards without
a goal reserve the same bottom slot as the progress bar so footers align. Goal progress
sits inside the bottom of the card. Clamp long names to two lines with a full-name tooltip;
keep the 300px popup width and bounded scrolling. Add task and Archived tasks
remain above the grid. Keep the glass within the existing violet palette.

Each custom row has one visible **pencil icon**, separate from its task selection
button, in a 44px target. It has an **Edit task: [name]** native hover tooltip and
matching accessible name. Choosing a task selects it; the pencil opens its details. Never
nest buttons. Show the selected task with the soft violet fill, accent border, and a check,
not only a check on an unchanged surface.
Keep selection checks at 12px and goal-completion checks at 10px so they remain
secondary to the task label. Preserve the existing control hit targets.

The editor contains the task name, goal settings, and labeled **Archive task** and
**Delete task** actions. Deletion needs a separate confirmation that explains what
happens to history and a running timer. The permanent default (initially General)
has the same edit pencil for its name, icon, goal target, enabled state, and days.
It never exposes Archive or Delete. Its null identity stays fixed when renamed,
so historical General time remains attributed to it and counts toward its goal.
Do not replace clear labels with an unexplained sliders icon or ellipsis menu.

### Statistics

Use a compact ivory Today card, a violet
graph, and compact supporting totals. Use matching 12px frames across the graph,
metrics, task history, and session history; use 10?12px card padding. Keep the graph ahead of secondary metrics.
Use one Day / Week / Month / Year dropdown and explicit date ranges. Day bars
represent local hours, including 23/25-hour daylight-saving days. Weeks start Monday;
week/month bars represent days, and year bars represent months. Graph totals and
Focus by task use the same period and navigation. Previous remains available for
empty earlier periods; Next returns toward the current period and is disabled
only at the current period. Do not add a separate date picker
or independent period selector to the task breakdown. Mark future buckets as
upcoming with dashed tracks and text, rather than treating them as missed focus.
Keep Today and clearly labeled all-time summaries separate from the selected
period. All sessions remains an all-history list with years included in dates.
Keep All sessions collapsed by default with a native, keyboard-accessible summary.
Show at most five sessions at a time inside it, with Newer / Older pagination.
Collapsing hides the records, and reopening starts at the newest page. Do not append
an ever-growing list or introduce competing chart colors.

### Website blocking overlay

Use a neutral opacity-only backdrop (`rgba(0,0,0,.45)`) and a solid surface panel
matching `--surface`, with the existing text and border colors. Keep the underlying
website sharp. No backdrop filters, blur, foggy shadows, movement, or fades. The
modal must lock document scrolling and intercept wheel/touch gestures outside the
warning, including gestures over nested feeds. Contain scrolling inside the
warning on small screens; stop page keyboard handlers while it is open. Restore
the page's original inline scroll styles and remove input guards when it closes.
Closed, navigated-away, and discarded tabs must not fail the timer command.
If a still-blocked open page rejects the overlay, recheck the deadline, URL, and
site permission before navigating it to the existing blocking page. Do not
redirect unrelated pages or bypass revoked site access. Surface a blocking error
if neither method works, retaining the underlying causes for local diagnostics.
The blocking page uses a compact centered panel with 28px headings. The overlay
uses a maximum 300px panel, 20px padding, and the same light/dark roles, including
changes to the saved theme while visible. This requires no additional extension
permissions. The overlay's isolated stylesheet uses literal matching colors because Chrome injects
the function without the popup stylesheet. Preserve modal blocking, keyboard
protection, partial-time interruption, and automatic removal at the focus target.

### States and feedback

Preserve the toolbar logo at its original size and position. During active focus,
show a filled violet face (#7052b5) with a centered ivory play symbol (#fffefa) and the
tooltip "Flow: Focus running". Preserve the original outer artwork; change the
whole inner face rather than adding a corner dot. Replace the clock hands with
a solid triangle so running focus differs in shape as well as color from idle.
The symbol indicates the running state; clicking still opens the popup.
This distinct filled state
must remain recognizable at 16px without relying on green or badge text.
Generate 16px and 32px variants from the original artwork using the icon script.
Keep the logo size unchanged. Clear native badge text during focus; no text block,
pulse, animation, or changing countdown. This quiet peripheral cue follows calm
technology and minimalist status guidance while retaining an explicit hover label.
Keep it through popup opens and ticks, and remove it when focus stops or a break
starts. Keep the filled face during overtime while time is still being counted.
When focus stops, restore the normal logo without a completion dot or badge.
Persist completion acknowledgement locally across worker restarts, independently
of notification preferences. Use "Flow: Focus complete" as the tooltip until the
popup is opened or a new session action acknowledges it; use "Flow: Focus running"
whenever focus is actively counting, and "Flow" when idle and acknowledged.
No blinking or full-screen interruptions. An optional completion chime plays in a
temporary offscreen document, independently of banners and without accessing the
video page. Settings includes a sound toggle and preview. Keep counting after target
is off by default. Changes apply during the countdown and to future sessions.
Overtime preserves the same session and reveals the existing end-focus and break actions.

Give icon-only controls native hover titles and accessible names; do not rely on
the icon alone. Native titles avoid clipping tooltips inside scroll containers.
Keep vertical scrollbars thin, with rounded thumbs using the existing divider and
accent colors. Reserve a stable scrollbar gutter and a content gap in Stats and
Settings; avoid horizontal scrolling and overlapping form controls.

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

### Settings and shared controls

Settings uses five compact, named sections: Timing, Appearance, Alerts, Website
blocking, and Local data. Every row uses the shared switch, input, and select
styles. Supporting explanations are associated with controls through
`aria-describedby`. Keep descriptions concise without hiding consequences.
Use 44px setting rows, 10px group padding, thin violet borders, and ivory/plum
surfaces. Data import/export, blocklist controls, previews, and destructive
confirmation states use the same compact action styles. Reset has an explicit
Cancel action. Preference switches respond immediately and restore their prior
value from persisted data if saving fails; show the error using the existing alert. Keep every control
reachable within the scroll area and preserve keyboard focus outlines.

Shared buttons stay stationary when pressed. Completion, overtime, break options,
and custom duration panels reuse the same 36px action targets and 12px card frames.
Do not expand the popup width for a secondary screen.

Completion audio is one short notification bell, under half a second, with a soft
attack and quick decay. Quiet simultaneous overtones give it a rounded bell timbre;
do not sequence notes or use a bare sine-wave beep. Use the same local sound for
previews, focus completion, and break completion. It is an original sound, not an
operating-system audio asset.

### Circular design references

The home composition adapts the center/periphery hierarchy in
[Samsung's circular UX case study](https://design.samsung.com/global/m/contents/circular_ux/)
and the unified, restrained bezel treatment described by
[Google's Nest design team](https://blog.google/products-and-platforms/devices/google-nest/nest-thermostat-google-tv-streamer-design-details/).
These are design references, not evidence that a particular Flow layout is optimal.
Use an original palette and typography, preserve pointer and keyboard access, and
verify long labels, real progress data, and the idle-to-running transition locally.

### Task-list design references

The Tasks page adapts the quiet rows and typographic hierarchy shown by
[Things](https://culturedcode.com/things/) and [TickTick](https://ticktick.com/features),
the configurable list information in [Linear](https://linear.app/docs/display-options),
and [Todoist's list view](https://www.todoist.com/features). These are references,
not copied interfaces; Flow keeps its own palette, task attribution, and popup size.
