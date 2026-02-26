# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
bundle install

# Local development server (http://localhost:4000)
bundle exec jekyll serve

# Build site to _site/
bundle exec jekyll build

# Serve with live reload
bundle exec jekyll serve --livereload
```

Requires Ruby 3.1.3 (see `.ruby-version`). The site deploys to GitHub Pages (gh-pages branch) and Vercel.

## Architecture

Jekyll site with Bootstrap 3, no remote theme — all layout/styling lives in the repo.

**Content flow:**
- `_pages/*.md` — individual pages (home, CV, research, publications, gallery, etc.)
- `_layouts/*.html` — page templates (`default.html` wraps everything; `homelay.html`, `publications.html`, `gridlay.html`, etc. extend it)
- `_includes/` — reusable partials: `head.html`, `header.html`, `footer.html`, `news.html`, `analytics.html`
- `_data/*.yml` — all structured content: `news.yml`, `publist.yml`, `team_members.yml`, `pictures_Leiden.yml`
- `_sass/bootstrap/` + `assets/main.scss` / `css/main.scss` — Bootstrap 3 source + custom overrides

**Custom plugin:** `_plugins/markdown.rb` registers a `{% markdown filename %}` Liquid tag that processes Liquid variables in a markdown file before converting it with kramdown. Used to embed dynamic markdown content within Liquid templates.

**Key layout decisions:**
- All pages use `layout: homelay` or another named layout in their front matter
- The navbar (Home, CV, Research, Publications, Gallery) is hardcoded in `_includes/header.html`
- News sidebar shows first 9 entries from `_data/news.yml`; `_pages/allnews.md` shows all
- Publications list lives in both `_pages/publications.md` (~3800 lines) and `_data/publist.yml`

**Image directories** under `images/`: `slider7001400/` (carousel, 7001×400 px), `pubpic/`, `respic/`, `newspic/`, `gallerypic/`, `logopic/`, `teampic/`.

**Deployment:** `CNAME` → `www.xuchenghe.science`; `vercel.json` enables clean URLs on Vercel.
