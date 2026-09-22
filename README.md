# Portfolio

Personal portfolio site — static HTML/CSS/JS, hosted on GitHub Pages.

## Swap content — replace &amp; rename, nothing else

Drop your file into this folder under the exact name below and the site updates automatically:

| What | File | Used for |
| --- | --- | --- |
| Your photo | `assets/profile2.jpg` | Hero avatar, browser tab favicon, link preview (OG/Twitter) |
| CV / resume | `cv/CV.pdf` | "Download CV" button + projects note link |
| Project screenshots | — | Replace the `placehold.co` URLs in `index.html` with real images in `assets/` |

If you want a photo that is only used for one spot (e.g. a square favicon only), add a new file
like `assets/favicon.jpg` and change the one matching line in `index.html`.

## Files

- `index.html` — all content (text, links, images)
- `style.css` — design; dark/light theme via `html[data-theme]` variables
- `script.js` — theme toggle, mobile nav, active-link highlight, contact form

## Contact form

Paste your real Formspree ID into `index.html`
(`https://formspree.io/f/YOUR_FORM_ID`). The submit handler and success/error states are already
wired in `script.js`.