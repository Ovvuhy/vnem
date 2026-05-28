# vnem landing

This folder is intentionally ignored by git so the public `vnem` repository can stay focused on the open connector, registry, generated install pack, and automation.

Deploy target: Cloudflare Pages direct upload via GitHub Actions.

The existing `vnem` Cloudflare Pages project is a Direct Upload project. Cloudflare does not let Direct Upload projects switch into native Git integration later, so `.github/workflows/deploy-cloudflare-pages.yml` deploys `landing/` with Wrangler whenever `main` changes.

Required GitHub settings:

- Repository variable `CLOUDFLARE_ACCOUNT_ID`
- Repository secret `CLOUDFLARE_API_TOKEN` with Cloudflare Pages edit permission

Before uploading, regenerate artifacts and copy the generated install archive into the landing bundle:

```bash
npm run generate
cp public/install.tgz landing/install.tgz
```

The short `/i` path is the public curl target shown on the page. It must be a real gzip archive, not only a `_headers` entry, otherwise Pages can serve `index.html` with the archive content type. The archive should extract `AGENTS.md` plus `.vnem/` so a clean folder is immediately agent-ready.

For local preview:

```bash
npx --yes serve landing
```
