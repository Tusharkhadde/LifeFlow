# LifeFlow Copilot

Chrome side-panel extension for LifeFlow. It asks your vault about the page you are on, saves the page or a selection, creates a follow-up task, and turns selected notes into tasks.

## Install (load unpacked)

1. In LifeFlow, open **Dashboard → Developer** and create an API key. Copy the `lf_live_…` value once.
2. Download `lifeflow-copilot.zip` from that page (or from `public/lifeflow-copilot.zip` in this repo) and unzip it.
3. Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select the unzipped `lifeflow-copilot` folder.
4. Click the toolbar icon (or press **Alt+Shift+L**). Paste your app URL and API key, then **Test connection**.

You can also load this `chrome-extension/` directory directly while developing.

## What it calls

| Action | API |
|--------|-----|
| Test connection | `GET /api/v1/me` |
| Ask my brain | `POST /api/v1/copilot` |
| Save page / selection | `POST /api/v1/knowledge` |
| Task from page | `POST /api/v1/tasks` |
| Notes → tasks | `POST /api/v1/meetings` |

The key needs the default full scope (`*`). Page text is read in the browser and sent with saves, so login-walled and client-rendered pages still land in the vault. Saving the same URL again returns the existing item.

Right-click a page or a selection for the same actions. Chrome internal pages (`chrome://`, the Web Store) cannot be read.

## Rebuild the downloadable zip

From the repo root, after changing these files:

```bash
node scripts/generate-extension-icons.mjs
node scripts/pack-extension.mjs
```

That refreshes `public/lifeflow-copilot.zip`, which the deployed app serves at `/lifeflow-copilot.zip`.
