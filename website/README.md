# LingForge website

A self-contained static site in `website/`: HTML, CSS, JavaScript and bundled fonts. No npm installation, framework, backend, account or external font service is needed to serve it. Motion includes glyph tracing, orbiting details, scroll reveals, subtle parallax/tilt, variant transitions and hover effects. The visitor can pause it; OS reduced-motion preferences take priority.

The workspace and invented language shown on the site are explicitly labeled illustrations. Feature and download copy distinguishes the experimental Linux release from unfinished Windows, IME and broader native acceptance. There are no invented testimonials or usage statistics.

## Preview locally

From the main `conlang` directory:

```bash
python3 -m http.server 4174 --bind 127.0.0.1 --directory website
```

Open `http://127.0.0.1:4174`. Stop the server with Ctrl+C. Python is only a local preview/build tool; site visitors need just a browser. Local downloads use the retained, checksum-verified file:

```text
website/downloads/LingForge_0.1.0_amd64.AppImage
```

The AppImage was moved here from `release-candidates/` to keep exactly one copy. Its bytes and SHA-256 are unchanged. `downloads/` is ignored by Git. Do not commit the binary: at 105.59 MiB it exceeds GitHub's 100 MiB regular Git file limit. Use a GitHub Release asset instead. [GitHub's file-size guidance](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).

## Publish on GitHub Pages

No GitHub repository has been selected or created and nothing has been published by this task. These steps make the prepared site live:

1. Put the project source in your GitHub repository, including `website/` and the root `.github/workflows/website.yml`. Preserve existing repository/environment metadata; do not upload build caches or ignored directories. The workflow assumes the website is a subdirectory of this repository.
2. In GitHub **Releases**, create a release with tag **`v0.1.0`**, mark it **pre-release**, and attach `website/downloads/LingForge_0.1.0_amd64.AppImage` and `website/checksums.txt`. Use `website/RELEASE-NOTES.md` as the description. Publish that release so downloads are public; a draft/private asset cannot serve ordinary visitors. Review the project's licensing/distribution checklist before making the application public; this preview does not claim stable-release acceptance or completed signing/license audits.
3. In repository **Settings → Pages**, set the publishing source to **GitHub Actions**.
4. In **Actions**, select **Publish LingForge website**, then **Run workflow** on the branch containing these files. There is deliberately no automatic push deployment.
5. The build uses the current repository name automatically, downloads the public AppImage without authentication, verifies all 110,717,432 bytes against the expected SHA-256, and replaces the local download link with its exact GitHub Release URL. If the release is missing, inaccessible or different, publication stops.
6. The deployment publishes only the allowlisted static site output. It excludes the AppImage, source scripts, local reports, documentation and app source. Open the Pages URL reported by the workflow. Verify the download once from that public URL.

Official [Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [release-asset API format](https://docs.github.com/en/rest/releases/assets) informed this setup. Actions use the documented Pages artifact/deploy interfaces. The app download lives in Releases; Pages serves the small website.

If you want a website-only repository, put these files inside a `website/` subdirectory there and put the supplied workflow in that repository's root `.github/workflows/`. The release asset must be in the same repository. The app source does not need to be uploaded to serve the website, subject to the applicable redistribution licenses.

## Build without publishing

To verify the local binary and generate `_site/` using your repository's URL:

```bash
python3 website/build.py --repository OWNER/REPOSITORY
```

Replace `OWNER/REPOSITORY` with the real repository. This mode does not check remote availability. To also validate the public download, use `--verify-release`; that is the mode required by the workflow. It streams the release through SHA-256 without keeping a second binary on disk. `_site/` is generated/ignored and safe to remove. The builder refuses to overwrite an unrecognized directory.

All asset links are relative, so project Pages URLs such as `username.github.io/lingforge/` and custom-domain roots use the same site. A custom domain still needs GitHub Pages/DNS configuration. Publishing `_site/` directly from the source tree without running the builder would not configure the release link.

## Maintain a release

Update `release.json`, visible version/size/hash/download filename in `index.html`, launch commands and hash in `launch-help.html`, `checksums.txt`, and `RELEASE-NOTES.md` together. Rebuild the app and independently validate the new bytes before publishing them. The builder checks metadata consistency and refuses a size/hash mismatch; never relabel a new binary with an old hash. Upload a matching release tag/asset, then run the Pages workflow again.

## Files

- `index.html`, `styles.css`, `app.js`: responsive landing page and progressive enhancement.
- `launch-help.html`, `notices.html`: runtime instructions, limitations, privacy and font notices.
- `assets/`: offline fonts and required redistribution notices, plus the existing LingForge mark.
- `release.json`, `checksums.txt`, `RELEASE-NOTES.md`: metadata and release upload material.
- `build.py`: Python standard-library release verification and Pages preparation.
- `downloads/`: the one retained local AppImage; excluded from Git and the Pages upload.
- `../.github/workflows/website.yml`: explicit Pages deployment after public artifact verification.

The site performs no analytics and sends no project data. The copy action writes only the shown checksum after an explicit click; it never reads the visitor's clipboard. Local storage holds only the optional motion preference. Hosting/download requests are subject to GitHub's policies.

## Verification completed

On 2026-11-19, Chromium passed 12 grouped checks: local assets, five responsive widths (320–1440px), keyboard tabs, glyph variants, persisted motion pause, OS reduced motion, exact checksum copying, the full download's byte count/SHA-256, automated WCAG A/AA scanning, mobile help/notices, JavaScript-disabled content/downloads, and absence of browser errors/failed assets. WebKit passed six additional grouped checks, including an actual completed AppImage download. WebKit used the project's isolated compatibility runtime on Arch; these are browser website checks, not new native-app acceptance.

Desktop/mobile screenshots were inspected. Two issues were corrected: a decorative orbit overflowed tablet width, and illustrative window controls needed more contrast. The build verifier also rejected truncated, oversized and wrong-hash streams. Local page links, anchor targets, font URLs and the generated GitHub download URL passed checks; the binary is excluded from the Pages artifact. Repository formatting and ESLint passed. Compact reports are retained in `../docs/evidence/website-*.json`; temporary screenshots, test scripts and browser compatibility caches were removed during the requested cleanup.

The GitHub workflow itself has not run and the public release URL cannot be verified until you select a repository and upload the asset. Local checks do not claim a deployed site.
