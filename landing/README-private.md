# vnem landing

This folder is intentionally ignored by git so the public `vnem` repository can stay focused on the open connector, registry, generated install pack, and automation.

Deploy target: Cloudflare Pages direct upload via GitHub Actions.

The existing `vnem` Cloudflare Pages project is a Direct Upload project. Cloudflare does not let Direct Upload projects switch into native Git integration later, so `.github/workflows/deploy-cloudflare-pages.yml` deploys `landing/` with Wrangler whenever `main` changes.

Required GitHub settings:

- Repository variable `CLOUDFLARE_ACCOUNT_ID`
- Repository secret `CLOUDFLARE_API_TOKEN` with Cloudflare Pages edit permission

Before uploading, regenerate artifacts and keep both install surfaces in the landing bundle:

```bash
npm run generate
cp public/install.tgz landing/install.tgz
```

The short `/i` path is the public checkout installer script shown on the page. The `/install.tgz` path is the safe project-pack archive for users who only want `AGENTS.md` plus `.vnem/` in an existing project.

For local preview:

```bash
npx --yes serve landing
```
