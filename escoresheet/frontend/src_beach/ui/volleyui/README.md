# volleyui kit

Plain-JSX React components and Tailwind v4 tokens for the owner's volleyball apps. Every class string is copied from svrz_rc (Swiss Volley Region Zürich referee coaching), and each file cites the `file:line` it came from. There is no build step and no TypeScript. Copy the folder into an app and import from it.

## Install

```bash
# 1. copy the kit into the app (any folder under src/ works)
cp -r ~/.claude/skills/volleyui/assets/kit src/ui/volleyui

# 2. dependencies (React 18/19 is assumed to be there already)
npm i tailwindcss @tailwindcss/vite @fontsource-variable/inter clsx tailwind-merge lucide-react
npm install          # keeps package-lock.json in sync (OpenVolley: run it in escoresheet/frontend)
```

`vite.config.js`:

```js
import tailwindcss from '@tailwindcss/vite';
export default { plugins: [react(), tailwindcss()] };
```

Load the stylesheet once, from the entry (`main.jsx`):

```js
import './ui/volleyui/tokens.css';   // replaces the app's own `@import "tailwindcss"`
```

If the app already has a main stylesheet, put `@import "./ui/volleyui/tokens.css";` at its top and delete its own `@import "tailwindcss"`. Tailwind v4 scans every non-gitignored file in the project for class names. If you put the kit somewhere it doesn't scan (outside the project root, or in a gitignored folder), add `@source "../path/to/kit";` after the import.

`index.html`:

```html
<html lang="de" translate="no">
<meta name="theme-color" content="#e2001a" />
```

Mount the imperative UI host once per React root, as a sibling of the page:

```jsx
import { ErrorBoundary, UiHost, ConnectionBanner } from './ui/volleyui';

createRoot(el).render(
  <ErrorBoundary onError={(e, info) => log(e, info.componentStack)}>
    <App />
    <UiHost />
    <ConnectionBanner state={net} lang="DE" />
  </ErrorBoundary>,
);
```

Fonts and icons come from npm (`@fontsource-variable/inter`, `lucide-react`) and are bundled by Vite, so the kit works fully offline. Don't swap in Google Fonts or an icon CDN.

## Files

| File | Exports |
|---|---|
| `tokens.css` | `@theme` brand red (`red-600` = `#e2001a`, `red-700` = `#be0014`), `shadow-card` / `shadow-card-lg`, Inter Display (`opsz` 32), light-only base, print (A4, `.no-print`), `.svrz-orbit` spinner motion, reduced motion |
| `cn.js` | `cn()`: clsx + tailwind-merge, with the `shadow-card*` scale registered |
| `format.js` | Zürich-clock dates (`shortDayLabel`, `dayTimeLabel`, `timeLabel`, `dayKey`, `todayKey`, `shiftDayKey`, …) and de-CH numbers (`fmtInt`, `fmtDec`, `chf`, `chfSigned`) |
| `tones.js` | semantic recipes: `NOTICE`, `BANNER`, `CHIP_TONE`, `TONE_TEXT`/`TONE_RAIL`, `TOAST_ACCENT`, `CONFIRM_ACCEPT`, `DOT`, `SERIES` (chart colours) |
| `Button.jsx` | `Button` (primary, secondary, ghost, dark, danger, danger-outline, danger-soft, positive, text, toolbar, hero × xs/sm/md/lg/xl), `ButtonGroup`, `FOCUS_RING`, `FOCUS_RING_INSET`, `renderIcon` |
| `IconButton.jsx` | `IconButton` (outline, outline-sm, close, subtle, toolbar, tool, hint; `label` required) |
| `Field.jsx` | `Field` (form / compact / eyebrow), `FormError`, `FormNotice` |
| `Input.jsx`, `Select.jsx`, `Textarea.jsx` | `Input`, `SearchInput`, `Select`, `SelectTrigger`, `Textarea` |
| `Switch.jsx`, `Checkbox.jsx` | `Switch`, `SwitchTrack`, `SwitchCard`, `Checkbox`, `Radio` |
| `SegmentedControl.jsx` | `SegmentedControl` / `Segmented` (track, joined, joined-quiet, pill, icon), `FilterPill` |
| `Row.jsx` | `RowList`, `Row`, `DateRail`, `RowRail`, `PairTitle`, `RowTool`, `SimpleRow`, `RowExpansion`, `ListPager`, `ROW_WASH` |
| `SectionHeader.jsx` | `SectionHeader` / `SectionHead`, `SectionNote`, `ListHeader`, `SortLabel`, `GroupBand`, `DayHeader`, `Eyebrow`, `ShowMoreToggle` |
| `Chip.jsx`, `StatusPill.jsx` | `Chip`, `MarkRow`, `ChipLine`, `Mark`, `AlertMark`, `CountBadge`; `StatusPill`, `StatusPills`, `OutlinePill`, `FlagPill`, `StatusDot`, `DeltaPill` |
| `KeyValue.jsx`, `Table.jsx` | `KeyValue` (split, detail, summary, stats, stacked), `KvLink`, `LedgerLine`; `Table` |
| `EmptyState.jsx` | `EmptyState`, `EmptyLine`, `EmptyInset`, `EmptyInCard` |
| `ProgressBar.jsx`, `StatCard.jsx` | `ProgressBar`, `StackedBar`, `BarList`, `ShareBar`; `StatTile`, `StatGrid`, `SummaryStrip`, `VerdictTile`, `MetricCard` |
| `Card.jsx` | `Card`, `CardHeader`, `CardHeading`, `CardMeta`, `CardFooter`, `Section`, `Grid`, `Block`, `SplitCard`, `HeroCard` |
| `Modal.jsx` | `Modal` (plain, sections, sheet; `decision` for the darker /60 scrim), `ModalRecord`, `ActionSheet` / `OptionsSheet`, `ActionSheetItem` / `OptionsRow`, `modalCancelClass`, `modalPrimaryClass`, `modalSaveClass`, `modalDangerClass` |
| `uiStore.js`, `UiHost.jsx`, `ConfirmDialog.jsx`, `Toast.jsx` | `confirmDialog()`, `toast.*`, `UiHost`, `ConfirmDialog`, `ToastStack` |
| `Banner.jsx` | `Banner`, `Notice`, `FieldNote`, `Callout`, `ModalStrip`, `ConnectionBanner` |
| `InfoHint.jsx`, `AppSpinner.jsx`, `Skeleton.jsx`, `ErrorScreen.jsx` | `InfoHint`; `AppSpinner`; `Skeleton`, `SkeletonRows` / `RowListSkeleton`, `SkeletonForm`, `ListLoading`; `ErrorScreen`, `ErrorBoundary`, `UpdateNotice`, `GateMessage` |
| `AppShell.jsx`, `BottomNav.jsx`, `Fab.jsx` | `AppPage`, `AppFooter`, `ModeBanner`, `ModeBannerButton`, `useBottomNavScrollPadding`; `BottomNav`, `BottomNavItem`; `Fab` |
| `ConsoleShell.jsx` | `ConsoleShell`, `ConsoleBadge`, `ConsolePanel`, `consoleHeaderBtn`, `consoleHeaderBtnPrimary` |
| `PageHeader.jsx`, `ReadingPage.jsx`, `PageToolbar.jsx` | `TitleCard`, `ReadingHeader`, `PageLead`, `CenteredBrand`; `ReadingPage`, `FormPage`, `GateScreen`; `PageToolbar`, `BackButton`, `toolbarBtn`, `PaperSheet`, `SubmitBar`, `LockedNotice`, `StickyBottomBar` |
| `index.js` | barrel with every named export above |

Every component is a named export. Most files also have a default export, for drop-in convenience.

## Usage

### A form in an editor

```jsx
import { Check, X, Trash2 } from 'lucide-react';
import { Field, Input, Textarea, Button, ButtonGroup, FormError, confirmDialog, toast } from './ui/volleyui';

<div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 sm:p-4 space-y-3">
  <div className="flex flex-wrap items-end gap-3">
    <Field label="Titel" tone="compact" className="flex-1 min-w-[12rem]"><Input value={title} onChange={onTitle} /></Field>
    <Field label="Datum" tone="compact"><Input type="date" value={date} onChange={onDate} /></Field>
  </div>
  <Field label="Notizen" tone="compact"><Textarea maxLength={2000} /></Field>
  <FormError>{error}</FormError>
  <ButtonGroup>
    <Button icon={Check} loading={busy} onClick={save}>Speichern</Button>
    <Button variant="ghost" size="sm" icon={X} onClick={cancel}>Abbrechen</Button>
    <Button variant="danger-outline" size="sm" icon={Trash2} className="ml-auto"
      onClick={async () => {
        if (!(await confirmDialog({ title: `«${title}» löschen?`, message: 'Kann nicht rückgängig gemacht werden.', confirmLabel: 'Löschen', tone: 'danger' }))) return;
        await remove();
        toast.success('Gelöscht.');
      }}>Löschen</Button>
  </ButtonGroup>
</div>
```

### A list section

```jsx
import { Clock } from 'lucide-react';
import { SectionHeader, SectionNote, RowList, Row, DateRail, PairTitle, Chip, StatusDot, RowTool, dayLabel, timeLabel, weekdayLabel } from './ui/volleyui';

<SectionHeader tone="amber" icon={<Clock size={14} />} title="Offen" count="2 offen" />
<SectionNote>Gespielte Matches ohne Matchblatt.</SectionNote>
<RowList className="mt-1">
  {games.map((g) => (
    <Row key={g.id} tone="amber" onOpen={() => open(g)}
      leading={<DateRail tone="amber" weekday={weekdayLabel(g.start)} date={dayLabel(g.start)} time={timeLabel(g.start)} league="2L Damen" foot={`#${g.number}`} />}
      title={<PairTitle primary={g.home} secondary={g.away} />}
      chips={<><Chip tone="sky">Cup</Chip><Chip tone="amber" wrap>{g.scorer}</Chip></>}
      location={g.hall}
      status={<StatusDot tone="todo" title="Offen" />}
      tools={<><RowTool primary>Öffnen</RowTool><RowTool>PDF</RowTool></>} />
  ))}
</RowList>
```

Inter has no ♂/♀ glyphs. Draw them as inline SVG, as svrz_rc does (`GameRow.tsx:51-61`), or write `H`/`D`.

### An app screen

```jsx
import { Home, CalendarDays, Menu, Languages, LogOut, NotebookPen } from 'lucide-react';
import { AppPage, BottomNav, BottomNavItem, OptionsSheet, OptionsRow, Fab, TitleCard, Card, AppFooter } from './ui/volleyui';

<AppPage bottomNav fab>
  <BottomNav label="Hauptnavigation" count={3}>
    <BottomNavItem icon={Home} active={tab === 'home'} onClick={() => setTab('home')}>Start</BottomNavItem>
    <BottomNavItem icon={CalendarDays} active={tab === 'games'} onClick={() => setTab('games')}>Spiele</BottomNavItem>
    <BottomNavItem icon={Menu} open={opts} aria-haspopup="dialog" aria-expanded={opts} onClick={() => setOpts((o) => !o)}>Optionen</BottomNavItem>
  </BottomNav>
  <OptionsSheet open={opts} onClose={() => setOpts(false)} title="Optionen">
    <OptionsRow icon={Languages} value={lang} onClick={toggleLang}>Sprache</OptionsRow>
    <OptionsRow icon={LogOut} onClick={logout}>Abmelden</OptionsRow>
  </OptionsSheet>
  <Fab icon={NotebookPen} label="Notizblock" aboveNav onClick={openPad} />

  <TitleCard title="Matchblatt" eyebrow="Swiss Volley Region Zürich" logo={<img src={logo} alt="SVRZ" className="h-10 w-auto" draggable={false} />} />
  <Card pad="list" stack={false}>…</Card>
  <AppFooter>v1.2 · Build abc123</AppFooter>
</AppPage>
```

### Dates and money

```js
import { shortDayLabel, dayTimeLabel, timeLabel, chf, chfSigned, fmtInt } from './ui/volleyui';
shortDayLabel('2026-09-21T20:45');          // "Mo 21.09."  (Zürich clock, never the device's)
dayTimeLabel('2026-09-21 18:45:00.000Z');   // "21.09.2026 20:45"
timeLabel('2026-09-21');                    // ""  (a bare date never shows 00:00)
`CHF ${chf(1234.5)}`;                       // "CHF 1'234.50" (U+0027 in current Chromium/Node; U+2019 on other ICU data)
chfSigned(-12);                             // "− 12.00"  (U+2212)
```

Always put numbers in a `tabular-nums` span.

## Re-branding

Change only `--color-brand`, `--color-brand-soft`, `--color-red-600` and `--color-red-700` in `tokens.css`. Every component spells the brand as `red-600` / `red-700`, so those four values re-brand the whole kit. Leave the stone neutrals and the semantic hues alone.

## Licences

The ball and whistle in `AppSpinner` are Game Icons (game-icons.net, CC BY 3.0). An app that ships `AppSpinner` must show a visible credit, as svrz_rc does in its footer. Lucide is ISC. Inter is OFL.
