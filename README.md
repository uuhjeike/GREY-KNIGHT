# GREY KNIGHT

Static profile site for GitHub Pages. Files: `index.html`, `style.css`, `script.js`, `posts/`, `assets/`. You only edit `posts/`.

## Add posts
1. Open any file in `posts/` (or create `posts/posts-002.txt`) and add a block.
2. New file? Add its name on a new line in `posts/index.txt`. If `index.txt` is missing, the site loads `posts-001.txt`, `posts-002.txt`, ... until one is absent.

## Format
A line containing only `-` separates posts. Never use a lone `-` line inside content.

```
-
ID: grey-knight-20261009-000004
DATE: 2026-10-09
TITLE: Optional title
CONTENT:
Any amount of text. Blank lines make paragraphs.
> quote line
```code fences work```
MEDIA:
https://github.com/user/repo/blob/main/a.jpg | optional caption
https://github.com/user/repo/blob/main/clip.mp4
https://www.youtube.com/watch?v=VIDEOID
https://www.youtube.com/shorts/VIDEOID
https://github.com/user/repo/blob/main/song.mp3
https://github.com/user/repo/blob/main/doc.pdf
https://example.com/anything-else
SOURCE: optional text or URL
ORDER: optional number (tie-break within the same DATE, lower first)
-
```
Fields: `ID` (required), `DATE`, `TYPE` (informational; type is detected from content), `TITLE`, `CONTENT`, `MEDIA`/`FILES`/`LINKS` (same behaviour, one URL per line), `SOURCE`, `ORDER`. Unknown fields are ignored. Relative paths such as `assets/pic.jpg` work. GitHub `blob` URLs are converted to raw URLs automatically.

## IDs and permanent links
`?post=<ID>` opens that post. The ID is the identity; position, date, title and content can all change. Rules for you: never reuse or edit an ID, and give every new post a new one (suggested: `grey-knight-YYYYMMDD-NNNNNN`, counter only goes up). Posts without a valid ID are skipped; a duplicate ID is ignored (the first stays) and a warning appears in the browser console.

## Scale
All files are parsed into a lightweight in-memory index (search and filters use it). The feed renders in blocks of 20 posts, adds blocks as you scroll, and empties blocks far off-screen so DOM and media players stay bounded. Split large archives into many files; the manifest has no limit.

## Profile
Status and bio come from `@status` and `@bio` lines in `posts/index.txt`. The profile image uses the GitHub URL, falling back to `assets/profile.png`.
