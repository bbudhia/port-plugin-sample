# Port Plugin Sample (Beta)

A sample plugin built with React and TypeScript. Host context (user, page, params, entity, API base URL, theme) and the Port API JWT come from **`@port-labs/plugins-sdk`**, which bridges `postMessage` with the Port web app. The app fetches blueprints from the Port API and includes an example entity search that uses **`mergePageFilters`**. The build produces a single **self-contained HTML file** (`dist/index.html`) with all JavaScript and CSS inlined, suitable for embedding in Port or similar plugin hosts.

## Tech stack

- **React 19** + **TypeScript** 5.9
- **`@port-labs/plugins-sdk`** — host messaging, `usePortPluginData`, `mergePageFilters`, `applyThemeCss`
- **TanStack React Query** for API data (blueprints; `entitiesSearch` example)
- **Webpack 5** with `InlineChunkHtmlPlugin` (from `react-dev-utils`) to inline JS and CSS into the HTML output
- **PostCSS** (with `postcss-preset-env`) for CSS

## Getting started

### Prerequisites

- Node.js **22+** (this repo targets the Node 22 LTS line; use an [LTS](https://nodejs.org/en/about/previous-releases) release in production)
- Yarn or npm
- **`@port-labs/plugins-sdk`**

### API base URL

Port API requests use **`portApiBaseUrl`** from the SDK (the **`baseUrl`** field the host sends on `PLUGIN_DATA`). Ensure your host includes `baseUrl` when it posts `PLUGIN_DATA`. The blueprints query runs when a token is present—without `baseUrl`, the fetch URL is invalid.

### Install

```bash
yarn install
```

### Configure `.env` for local dev

Copy the template and fill in values:

```bash
cp .env.example .env
```

There are two ways to authenticate the dev harness — pick one:

- **Static token** — set `PORT_DEV_TOKEN`. Simple, but the token doesn't refresh.
- **Client credentials** — set `PORT_CLIENT_ID` + `PORT_CLIENT_SECRET`. On startup, `SimulatePort` POSTs to `/v1/auth/access_token` and uses the returned token. **Takes precedence over `PORT_DEV_TOKEN`** when both are set.

| Variable | Used by | Notes |
|---|---|---|
| `PORT_DEV_TOKEN` | `SimulatePort` (dev only) | Static Port API token. Generate one in Port → profile → **Credentials → Generate API token**. |
| `PORT_CLIENT_ID` | `SimulatePort` (dev only) | Client ID for the client-credentials flow. Find under Port portal → **Settings → Credentials → Client credentials**. |
| `PORT_CLIENT_SECRET` | `SimulatePort` (dev only) | Client secret paired with `PORT_CLIENT_ID`. |
| `PORT_DEV_BLUEPRINT_ID` | `SimulatePort` (dev only) | Blueprint identifier whose entities populate the dev entity picker. |
| `PORT_DEV_ENTITY_IDENTIFIER` | `SimulatePort` (dev only) | Optional — entity to preselect on load. Falls back to the first entity returned. |
| `PORT_DEV_API_BASE_URL` | `SimulatePort` (dev only) | Defaults to `http://localhost:9000`. The dev server proxies `/v1/*` to `https://api.port.io` (see `webpack.config.js`), so the default works out of the box. |

All `PORT_*` variables above are inlined by `webpack.DefinePlugin` **only in development mode**. They are not present in production builds. Never commit a real `.env`.

### Development

Run the dev server with hot reload on port 9000:

```bash
yarn dev
```

Open [http://localhost:9000](http://localhost:9000) to preview the plugin UI. In production, Port embeds the plugin in an iframe and sends `PLUGIN_DATA` / `PORT_TOKEN` via `postMessage`. Locally there is no parent window, so the `SimulatePort` dev harness (described below) stands in for the host.

### SimulatePort — local dev harness

`src/SimulatePort.tsx` is a dev-only stand-in for Port's parent window. It renders only when `NODE_ENV === "development"` **and** the page is opened standalone (not inside an iframe). The production build replaces it with `SimulatePort.stub.tsx` via webpack's `NormalModuleReplacementPlugin`, so none of this code ships.

**What it does**

1. **Resolves a token.** If `PORT_CLIENT_ID` + `PORT_CLIENT_SECRET` are set, POSTs to `/v1/auth/access_token` to exchange them for an access token. Otherwise uses `PORT_DEV_TOKEN` directly.
2. **Replies to `REQUEST_PORT_TOKEN`.** The SDK posts this on mount; `SimulatePort` responds with `PORT_TOKEN`. If the request arrives before the token fetch completes, the response is held and sent as soon as the token resolves.
3. **Fetches entities** for `PORT_DEV_BLUEPRINT_ID` via `GET /v1/blueprints/<id>/entities` (proxied to `https://api.port.io`).
4. **Posts `PLUGIN_DATA`** containing the selected entity, a stub `user`, `baseUrl`, and a minimal light theme — the same shape Port's host sends in production.
5. **Renders a top toolbar** with a searchable combobox so you can switch the simulated "current entity" while developing. Selecting an entity re-posts `PLUGIN_DATA` so `usePortPluginData()` updates downstream.

**Toolbar status hints**

- `set PORT_DEV_TOKEN or PORT_CLIENT_ID/PORT_CLIENT_SECRET in .env` — no auth configured.
- `fetching token…` — client-credentials POST in flight.
- `token fetch failed — see console` — `/v1/auth/access_token` rejected the credentials.
- `set PORT_DEV_BLUEPRINT_ID in .env` — auth ready, blueprint missing.
- `PORT_TOKEN ready` (green) — feeding the plugin via static token. Suffixed with `(client creds)` when using the credentials flow.

**Protocol parity** — the messages SimulatePort posts match the SDK contract exactly (see the *PostMessage events* section below), so code that works with the dev harness works unchanged when embedded in Port.

### Build

```bash
yarn build
```

Output is written to `dist/`:

- **`dist/index.html`** — single HTML file with inlined JS and CSS, ready to host or embed in Port.

## How it works

1. **Host communication** — The SDK registers listeners for `PORT_TOKEN` and `PLUGIN_DATA`, and posts `REQUEST_PORT_TOKEN` when embedded in an iframe so the host can deliver a JWT after the iframe is ready.
2. **UI** — `App` uses **`usePortPluginData()`** from `@port-labs/plugins-sdk/react` for `params`, `page`, `user`, `entity`, and calls **`applyThemeCss()`** in a `useEffect` so the host theme applies when `theme.css` updates.
3. **Blueprints** — `BlueprintDataCard` uses `useBlueprints`: once `portToken` exists, it calls `{portApiBaseUrl}/v1/blueprints` with `Authorization: Bearer <token>`. The query refetches every **5 minutes**.
4. **Entity search example** — `entitiesSearch` (in `entitiesSearch.ts`) posts to `/v1/entities/search` and merges the widget query with dashboard page filters via **`mergePageFilters`** from `@port-labs/plugins-sdk`.

See the SDK’s own README for **`subscribe` / `getSnapshot`**, **`initPortPluginMessaging`**, and non-React usage.

## PostMessage events

The plugin runs inside an iframe. The SDK aligns with this protocol:

### Plugin → Host (sent by the SDK)

| Event type           | When                         | Payload | Meaning |
|----------------------|------------------------------|---------|---------|
| `REQUEST_PORT_TOKEN` | When messaging is initialized (iframe) | `{ type: 'REQUEST_PORT_TOKEN' }` | Asks the host for a JWT for Port API calls. |

### Host → Plugin (handled by the SDK)

| Event type    | Payload | Meaning |
|---------------|---------|---------|
| `PORT_TOKEN`  | `{ type: 'PORT_TOKEN', token: string }` | JWT from the host. |
| `PLUGIN_DATA` | `{ type: 'PLUGIN_DATA', params?, page?, user?, entity?, baseUrl?, theme? }` | Context from the host. **`baseUrl`** becomes **`portApiBaseUrl`** in the React hook. |

## Project structure

```
├── src/
│   ├── index.html           # HTML template (includes #plugin-root)
│   ├── index.tsx            # React entry, QueryClientProvider, mounts into #plugin-root
│   ├── App.tsx              # Main app: usePortPluginData, PluginDataCard rows, examples
│   ├── App.css
│   ├── types.ts             # DataCard / PluginDataCard prop types
│   ├── components/
│   │   ├── index.ts
│   │   ├── PluginDataCard.tsx
│   │   ├── BlueprintDataCard.tsx
│   │   ├── EntitiesSearchExample.tsx
│   │   └── DataCard/
│   │       ├── index.ts
│   │       ├── DataCard.tsx
│   │       ├── EmptySection.tsx
│   │       └── ErrorSection.tsx
│   └── hooks/
│       ├── useBlueprints.ts   # GET /v1/blueprints
│       └── entitiesSearch.ts  # POST /v1/entities/search + mergePageFilters
├── webpack.config.js
├── tsconfig.json
└── package.json
```

The app mounts into `<div id="plugin-root">` in the template. The production build inlines the compiled bundle into `dist/index.html`.

## Theming and CSS variables

The host can send a **`theme`** object on **`PLUGIN_DATA`**. The SDK exposes it from **`usePortPluginData()`** along with **`applyThemeCss`**, which injects or clears the theme stylesheet in `document.head` (see the SDK docs for the exact element id).

```tsx
import { useEffect } from 'react';
import { usePortPluginData } from '@port-labs/plugins-sdk/react';

function App() {
  const { applyThemeCss } = usePortPluginData();

  useEffect(() => {
    applyThemeCss();
  }, [applyThemeCss]);
}
```

`App.css` uses theme variables with fallbacks, for example:

```css
body {
  background: rgb(var(--primary, 245, 247, 250));
  color: var(--text-high, #1a1a2e);
}

.plugin-container {
  background: var(--background-primary, #fff);
}

.data-row {
  /* Prefer inset surfaces (e.g. --background-dim-transparent) over --background-contrast so rows stay on the same tonal mode as the card in both light and dark host themes */
  background: var(--background-dim-transparent, rgba(0, 0, 0, 0.04));
  border-color: var(--border-medium, #e2e8f0);
}
```

Common variables you can reuse include (non‑exhaustive):

- `--background-primary`: main surface/background color
- `--background-dim` / `--background-dim-transparent`: softer backgrounds and cards (good for inset rows on a card)
- `--background-contrast`: high‑contrast surface (can invert between light/dark host themes—inset rows in this sample use `--background-dim-transparent` instead)
- `--text-high` / `--text-medium` / `--text-low`: primary, secondary, and subtle text
- `--border-medium` / `--border-contrast-medium`: border colors
- `--primary`: RGB triple for primary color, used via `rgb(var(--primary))`

The full set is defined in the CSS string the host sends in **`theme.css`**.
