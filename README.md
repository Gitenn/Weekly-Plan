# Rose & Ribbon Planner

Rose & Ribbon is a personal weekly planner designed to make keeping track of daily life and studies feel inviting. It combines a soft, botanical wallpaper with readable day cards, appointments, and a daily focus. The visual goal is intentional: a design that feels beautiful and personal can make returning to a planner more motivating. The practical goal is to get some experience with vibe coding on a topic that I find relevant. 

## What it does

- Shows five weekday cards (Monday to Friday); weekends are not displayed. 
- Displays appointments and a daily focus on each day card, without card-level scrollbars.
- Lets you add, edit, and delete appointments and save a daily focus from the flower-shaped edit control or by selecting a day card.
- Saves the schedule and displayed week locally in `planner-data.json`. This personal file is deliberately excluded from Git.
- Shares the same saved schedule and selected week between the browser planner and the Lively desktop wallpaper.
- Refreshes active Lively wallpaper copies when the local planner server saves data or starts.
- Uses botanical illustrations and slow, out-of-sync animations for a living-wallpaper feel.
- Fits the desktop planner to the screen without a page scrollbar, while leaving space near the screen edges for desktop shortcuts.

The project currently uses local data and a local server; it does not yet connect to Google Calendar, Microsoft Outlook, or another external calendar. The images used are public domain original artworks. 

## How to use it

### Start the planner

1. Double-click **START-ROSE-RIBBON.bat**, or use the **Rose & Ribbon Planner** desktop shortcut.
2. The launcher starts the local server and opens the planner in your browser.
3. The launcher keeps the local server running in the background while the planner is in use so it can sync with Lively.

The server listens on `http://127.0.0.1:41731/`. It is intended for this computer, not as a public or shared web service.

### Plan your week

- Select a day card to open that day's planner.
- Use the incognito flower-shaped button in the lower-right corner to open the editor. 
- Add, edit, or delete appointments; set the daily focus and save it.
- Use the arrows to change weeks and **This week** to return to the current week.
- The displayed week is shared with Lively, so the wallpaper follows the planner's selected week.

### Use Lively

Choose **Rose & Ribbon Planner** from the Lively wallpaper library or your own pc library, if it is not already active. The local server initializes the installed wallpaper and updates active temporary Lively copies. If Lively has cached an older appearance after a visual update, reselect the wallpaper in Lively.

## Project layout

```text
wallpaper-test/
|-- index.html                 Planner page and offline schedule snapshot
|-- app.js                     Rendering, editing, and schedule synchronization
|-- styles.css                 Planner, responsive layout, flowers, and motion
|-- server.ps1                 Local API and Lively wallpaper synchronization
|-- Launch-RoseRibbon.ps1      Starts the server and opens the planner
|-- START-ROSE-RIBBON.bat      Windows launcher and desktop shortcut target
|-- assets/
|   |-- botanical/             Botanical illustrations used by the planner
|   `-- reference/             Optional local-only design references (ignored by Git)
|-- logs/                      Local server diagnostics (ignored by Git)
`-- planner-data.json          Local personal schedule (ignored by Git)
```

The root page contains an empty, non-personal starter snapshot for a clean public checkout. Your private schedule is stored only in the local, ignored `planner-data.json` file. When the server is running, it creates a personalized snapshot in Lively's local wallpaper folder; it never writes personal schedule data back into the project page.

## Privacy before publishing

- `planner-data.json`, temporary schedule files, server logs, and local reference images are excluded by `.gitignore`.
- The committed `index.html` snapshot is intentionally empty. The local server leaves it that way while it updates the private Lively copy.
- Before publishing, review the staged changes with `git status` and `git diff --cached`. Do not force-add personal data or local reference material.

## Vibe-coding process and design goal

This project was developed as a practical experiment in vibe coding: describe a desired feeling and workflow in everyday language, try an implementation, then respond to what is actually visible on screen. The planner's design was refined through repeated feedback and screenshots rather than treating the first generated layout as final. Browser rendering and the Lively desktop copy were checked separately because a wallpaper can use its own temporary copy of the files.

The central design question was whether a visually pleasing, expressive planner could encourage more consistent planning for everyday life and studies. The floral collage, vintage typography, spacious cards, and subtle motion are part of that motivation experiment, while the saved schedule and shared selected week make the planner useful day to day.

## Possible future features

- Toggle on and off weekend days while maintaining a sleek layout
- Make other designs and a menu for choosing among them
- Optional Google Calendar integration, with a clear choice of read-only import or two-way synchronization.
- Optional Microsoft Outlook or Microsoft 365 calendar integration.
- Calendar selection, conflict handling, and controls for which external events appear on the wallpaper.
- Import/export and backup/restore for `planner-data.json`.
- Customizable weekly focus, color themes, and accessibility settings.

Calendar integrations are ideas for future work, not features available in the current project. They would require account authorization, careful handling of access tokens and personal data, and explicit decisions about read-only versus write access before implementation.
