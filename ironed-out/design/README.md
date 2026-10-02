# Design reference

These are the source files of the approved clickable design (built in Claude's Design canvas).
They use the canvas's component runtime, so they won't open as standalone web pages. Read them
for layout, copy, colors, spacing and interaction behavior; rebuild the UI with real React
components that match.

- `Main.dc.html` – the full clickable phone prototype (390×844). One file, every screen:
  welcome, sign up, log in, home, crew, alerts, new outing, share, invite page, claim sheet.
  Screens are the `<sc-if value="{{isX}}">` blocks; behavior is in the `Component` class at the
  bottom (claim logic, guest filling, organizer controls, course list with demo drive times).
- `LinkPreview.dc.html` – the Open Graph card shown when the link is pasted in a group chat.
- `TextAlerts.dc.html` – example SMS copy.

Live canvas (owner access): https://claude.ai/artifact/JgbWRSLzQmtgCrwtmz5F2F
