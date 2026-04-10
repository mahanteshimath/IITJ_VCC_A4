# Cloud Systems Learning Lab

An interactive static website that turns cloud computing notes into hands-on learning labs.

## What this project contains

- Interactive web experience in `index.html`, `styles.css`, and `script.js`
- Topic notes in `cloud/` (modules 01 to 15)
- Supporting visuals in `cloud/images/`
- Lightweight local static server in `serve-local.js`

## Local development

### Option 1: Open directly

Open `index.html` in a browser.

### Option 2: Serve locally (recommended)

This avoids browser restrictions and uses a local HTTP server on port `4173`.

```bash
node serve-local.js
```

Then open:

- `http://127.0.0.1:4173/index.html`

## Hosting on GitHub Pages

This repository already includes an automated workflow:

- `.github/workflows/deploy-pages.yml`

On every push to `main`, GitHub Actions deploys the site to GitHub Pages.

### One-time GitHub setup

1. Create a GitHub repository and push this project.
2. In GitHub repository settings, go to **Pages**.
3. Set source/deployment to **GitHub Actions**.

After deployment, your site will be available at:

- `https://<username>.github.io/<repository-name>/`

## Notes

- This is a static site; no backend is required.
- Keep media paths relative so GitHub Pages serves them correctly.
