# Labour.Group frontend

This folder is ready to upload as the root of a new GitHub repository and connect to Cloudflare Pages.

## Structure

- `index.html` and the `.js`/`.css` files are the browser frontend.
- `functions/api.js` is the Cloudflare Pages Function.
- The Pages Function forwards `/api` requests to the configured Apps Script deployment.

## Cloudflare Pages

Connect this repository to Cloudflare Pages and deploy it without a build step.

- Framework preset: None
- Build command: leave blank
- Build output directory: `/`

The function route will be:

`/api`

Opening `/api` in a browser should return a small JSON service response.

## Apps Script

Keep `Api.gs` and the existing backend `.gs` files in Apps Script. Deploy the Apps Script project as a web app using the URL already configured in `functions/api.js`.
