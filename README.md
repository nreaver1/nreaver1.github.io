# nreaver1.github.io

Personal portfolio and project hub, hosted via GitHub Pages.  
Live at **[nreaver1.github.io](https://nreaver1.github.io)**

---

## Projects

### [Nexus](https://nreaver1.github.io/nexus)
A session tracker for Dungeons & Dragons campaigns. Nexus helps dungeon masters and players keep a structured record of sessions, party members, treasury, loot, and story milestones across a campaign.

**→ Repo:** [github.com/nreaver1/nreaver1.github.io/tree/master/nexus](https://github.com/nreaver1/nreaver1.github.io/tree/master/nexus)

---

### [KeepTrack](https://nreaver1.github.io/keeptrack)
A shared ledger for tracking wins and losses between friends across any game or competition. Simple, honest scorekeeping with no setup required.

**→ Repo:** [github.com/nreaver1/nreaver1.github.io/tree/master/keeptrack](https://github.com/nreaver1/nreaver1.github.io/tree/master/keeptrack)

---

## Repository Structure

```
nreaver1.github.io/
├── index.html        # Portfolio home page
├── nexus/            # Nexus D&D session tracker
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── ...
└── keeptrack/        # KeepTrack wins/losses ledger
    ├── index.html
    └── ...
```

## Branching Strategy

```
master        ← stable, live production branch
  ├── nexus        ← active Nexus development
  └── keeptrack    ← active KeepTrack development
```

- All development happens on project branches
- Branches are merged into `master` when stable
- GitHub Pages serves directly from `master`

---

## Tech

- Hosted with **GitHub Pages**
- No build step — plain HTML, CSS, and JavaScript
- Project backends powered by **Supabase**

---

*Built by [Nick Reaver](https://github.com/nreaver1)*
