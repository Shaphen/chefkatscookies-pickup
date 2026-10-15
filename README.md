# Chef Kat's Cookies — delivery customization Function

One delivery-customization Function (`extensions/pickup-delivery-customization`) that:

1. **Pickup:** a cart with `Fulfillment Method = Pickup` sees only the $0 "Local Pickup" rate; every other cart never sees it.
2. **ZIP-priced delivery:** delivery is sold as four flat shipping rates in the California zone (Local / Semi-Local / Standard / Long Distance Delivery). The Function shows each buyer only the tier for their ZIP and hides them all outside the area. This replaced Shopify's native Local Delivery, which Apple Pay / Google Pay / PayPal express checkout can't see (they showed "doesn't ship to your address").

## ZIP tiers

Source of truth: [`config/delivery-zip-tiers.csv`](config/delivery-zip-tiers.csv) — one row per ZIP, priced by straight-line distance from Fremont 94538 (≤10 mi free, ≤15 $3.99, ≤25 $4.99, ≤50 $7.99). Only the `zip`, `tier` and `price` columns are used; the rest are for reading.

To correct a ZIP: edit its row (change `tier` + `price`, add a row, or delete it to stop delivering there), then:

```bash
npm run zips:sync              # dry run: shows which ZIPs change
npm run zips:sync -- --apply   # live at checkout immediately, no deploy needed
```

To rebuild the whole table (new origin or tier edges — edit the constants in `scripts/build-zip-tiers.cjs`): `npm run zips:build` (**overwrites** manual edits), then sync. If tier titles or prices change, also run `npm run rates:setup -- --apply` so the Shopify rates match.

Scripts authenticate as this app: the first run opens a browser to approve access and caches an offline token in `.shopify-admin-token.json` (gitignored). The Shopify CLI must be logged in (`shopify app env show`).

---

# Shopify App Template - Extension only

This is a template for building an [extension-only Shopify app](https://shopify.dev/docs/apps/build/app-extensions/build-extension-only-app). It contains the basics for building a Shopify app that uses only app extensions.

This template doesn't include a server or the ability to embed a page in the Shopify Admin. If you want either of these capabilities, choose the [Remix app template](https://github.com/Shopify/shopify-app-template-remix) instead.

Whether you choose to use this template or another one, you can use your preferred package manager and the Shopify CLI with [these steps](#installing-the-template).

## Benefits

Shopify apps are built on a variety of Shopify tools to create a great merchant experience. The [create an app](https://shopify.dev/docs/apps/getting-started/create) tutorial in our developer documentation will guide you through creating a Shopify app.

This app template does little more than install the CLI and scaffold a repository.

## Getting started

### Requirements

1. You must [download and install Node.js](https://nodejs.org/en/download/) if you don't already have it.
1. You must [create a Shopify partner account](https://partners.shopify.com/signup) if you don’t have one.
1. You must create a store for testing if you don't have one, either a [development store](https://help.shopify.com/en/partners/dashboard/development-stores#create-a-development-store) or a [Shopify Plus sandbox store](https://help.shopify.com/en/partners/dashboard/managing-stores/plus-sandbox-store).

### Installing the template

This template can be installed using your preferred package manager:

Using yarn:

```shell
yarn create @shopify/app
```

Using npm:

```shell
npm init @shopify/app@latest
```

Using pnpm:

```shell
pnpm create @shopify/app@latest
```

This will clone the template and install the required dependencies.

#### Local Development

[The Shopify CLI](https://shopify.dev/docs/apps/tools/cli) connects to an app in your Partners dashboard. It provides environment variables and runs commands in parallel.

You can develop locally using your preferred package manager. Run one of the following commands from the root of your app.

Using yarn:

```shell
yarn dev
```

Using npm:

```shell
npm run dev
```

Using pnpm:

```shell
pnpm run dev
```

Open the URL generated in your console. Once you grant permission to the app, you can start development (such as generating extensions).

## Developer resources

- [Introduction to Shopify apps](https://shopify.dev/docs/apps/getting-started)
- [App extensions](https://shopify.dev/docs/apps/build/app-extensions)
- [Extension only apps](https://shopify.dev/docs/apps/build/app-extensions/build-extension-only-app)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
