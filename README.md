# HiveBooks 🐝

A bee-themed book recommendation site for young readers. Browse a "skill tree" of
books that grows from ages 4–6 up to ages 11–13, track what you've finished, earn
Nectar, and rate the books you've read.

## Run it

No build step and no server needed — just open `index.html` in a browser.

```
open index.html
```

## What's inside

| File | Purpose |
|---|---|
| `index.html` | All screens live here (login, honeycomb menu, content views) |
| `css/styles.css` | Honey & gold theme, hexagons, bees, modal |
| `js/books.js` | The book catalogue, level metadata, and similarity connections |
| `js/app.js` | View routing, the skill tree, and the book popup |
| `js/auth.js` | Accounts, reading progress, Nectar, ratings |
| `js/storage.js` | Where account data is saved |
| `assets/bee.svg` | The flying bee |

## Features

- **Login / create account**, with bees flying around the login box
- **Honeycomb menu** of 8 hexagons
- **The Honeycomb** — a book skill tree. Levels run left to right, easiest to
  hardest. Lines connect a book to ones its fans will enjoy at the next level,
  and hovering a book explains why.
- **Want to Read** (turns a book blue) and **Finished Reading** (turns it green
  and awards Nectar). Both can be undone.
- **HiveScore** — a /10 rating built only from real reader ratings.
- **Content warnings** — books with scary or mature content show a severity
  rating out of 5. The details are hidden behind a spoiler cover.
- **To the Hive** — updates from the developer.

## Adding a book

Add an entry to `SAMPLE_BOOKS` in `js/books.js`:

```js
{ id: "x1", level: 4, title: "Book Title", shortTitle: "Short Name", author: "Author Name",
  genres: ["Fantasy", "Humor"], ageAlone: 8, ageAdult: 6, nectar: 40,
  warning: { level: 2, text: "What a parent might want to know." },   // optional
  blurb: "One sentence about the book." },
```

Then link it in `CONNECTIONS` as `[easierBookId, thisBookId, "why they're similar"]`.
Connections must go **exactly one level up**. `nectar` should be `level × 10`.

## A note on accounts

Accounts are stored in the browser and passwords are hashed, but this is a
demo-quality login — anything running only in a browser can't truly keep secrets.
Don't reuse a real password here.
