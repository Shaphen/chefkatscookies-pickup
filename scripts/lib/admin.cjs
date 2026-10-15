// Admin GraphQL client for local maintenance scripts, authenticated AS this app
// (chefkatscookies-pickup-fn). Only the owning app can write the function's
// `$app:` config metafield, so we can't borrow another app's token.
//
// First run does a one-time OAuth grant: opens the store's authorize page in
// the browser, catches the redirect on http://localhost:3456/callback, and
// caches the offline token in .shopify-admin-token.json (gitignored). Later
// runs reuse it until the app's scopes change. The client secret is read from
// `shopify app env show`, so the Shopify CLI must be logged in.

const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const SHOP = 'k19iss-94.myshopify.com';
const API_VERSION = '2026-07';
const ROOT = path.join(__dirname, '..', '..');
const TOKEN_FILE = path.join(ROOT, '.shopify-admin-token.json');
const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

function appConfig() {
  const toml = fs.readFileSync(path.join(ROOT, 'shopify.app.toml'), 'utf8');
  const clientId = toml.match(/^client_id\s*=\s*"([^"]+)"/m)[1];
  const scopes = toml.match(/^scopes\s*=\s*"([^"]*)"/m)[1];
  return { clientId, scopes };
}

function clientSecret() {
  const out = execSync('shopify app env show', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const m = out.match(/SHOPIFY_API_SECRET\W+([A-Za-z0-9_]+)/);
  if (!m) throw new Error('Could not read SHOPIFY_API_SECRET — run `shopify app env show` once to log in.');
  return m[1];
}

const sameScopes = (a, b) => [...a.split(',')].sort().join() === [...b.split(',')].sort().join();

async function oauth({ clientId, scopes }) {
  const secret = clientSecret();
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl =
    `https://${SHOP}/admin/oauth/authorize?client_id=${clientId}` +
    `&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/callback') return res.end();
      res.end('Authorized - you can close this tab and return to the terminal.');
      server.close();
      if (url.searchParams.get('state') !== state) return reject(new Error('OAuth state mismatch'));
      resolve(url.searchParams.get('code'));
    });
    server.listen(PORT, () => {
      console.log(`\nApprove access in your browser (opening now):\n${authUrl}\n`);
      const opener = process.platform === 'win32' ? `start "" "${authUrl}"` : `open "${authUrl}"`;
      try { execSync(opener, { stdio: 'ignore' }); } catch {}
    });
  });

  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: secret, code }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(body)}`);
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: body.access_token, scopes }, null, 2));
  return body.access_token;
}

let tokenPromise;
function getToken() {
  if (!tokenPromise) {
    const cfg = appConfig();
    let cached = null;
    try { cached = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')); } catch {}
    tokenPromise = cached && sameScopes(cached.scopes, cfg.scopes) ? Promise.resolve(cached.token) : oauth(cfg);
  }
  return tokenPromise;
}

async function gql(query, variables = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await getToken() },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(`Admin API error: ${JSON.stringify(body.errors ?? body)}`);
  return body.data;
}

module.exports = { gql, SHOP };
