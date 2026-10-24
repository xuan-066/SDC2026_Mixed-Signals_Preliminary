# Standalone HTML demo

The downloadable `generated-artifacts/glacier-link-demo.html` is the existing
Glacier Link interface packaged into **one self-contained HTML file**.
It embeds JavaScript, CSS, logo, sample records and fonts. It does not call
Replit, Clerk, the API server or any real business database.

## Open or share

Download the file and open it in a modern browser with JavaScript and browser
storage enabled. Sign in with the existing four demo usernames and their
assigned demo passwords. These are simulated identities, **not secure accounts**.

To host elsewhere, upload the HTML to any static website host. It can be renamed
to `index.html`. Navigation uses URL fragments such as `#/dashboard`, so the host
does not need server-side routing or SPA rewrites.

## What is saved

- Profile, equipment, stock, reports, incidents, approvals, vendor jobs, vendors,
  settings, team and notification edits are simulated in browser local storage.
- Each browser/site has its own records. Visitors never share changes.
- Refreshing or logging out does not erase edits. **Reset demo** restores the
  fictional sample scenario in that browser only.
- Clearing browser/site data, private browsing, moving the file, or changing its
  hostname can remove or separate saved data. Browser behavior for storage on
  `file://` URLs varies; a static-hosted URL is more predictable.
- The mock outbox and invitation records demonstrate actions only. No messages
  or usable invitations are sent. Report recommendations use local rules rather
  than an AI service. Role restrictions are UI/demo behavior, not a security
  boundary.
- Do not enter real passwords, customer information or operational records.

## Rebuild after editing the app

From the workspace root:

```sh
pnpm --filter @workspace/sejukguard build:standalone
```

The exporter reuses the current app and embeds its assets. Internet access is
needed **only when rebuilding** to download fonts; the exported file itself is
offline-capable.

The committed sample fixture is created from a new, isolated in-memory demo app,
never an operational or existing demo database. To regenerate that fixture:

```sh
python3.12 scripts/export-standalone-seed.py
```

The ordinary backend-connected preview and publishing setup remain separate.
