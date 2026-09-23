# Deploying the verifier UI

Two workflows. `docker-build.yml` publishes an image to GHCR on push.
`docker-deploy.yml` is manual only, so merging a branch never changes what is
running.

The deploy drives the box's Docker daemon over SSH. Nothing is copied to the
server: compose reads the file and the environment on the runner and sends the
daemon an already-expanded spec.

This is the simplest stack in the set. A static SPA behind nginx: no database,
no volumes, no keys, and one secret, the SSH key.

## Before the first deploy

One thing. **The edge must be up:** nginx-proxy, acme-companion and the
`proxy-net` network are defined in `eudi-srv-wallet-provider`, not here. Deploy
that stack first. The preflight step checks and stops if `proxy-net` is missing.

## Repository secrets

| Secret | What it is |
| --- | --- |
| `SSH_KEY` | Private key authorised for `ubuntu@3.69.83.252`. Written to `~/.ssh/eudiw-deploy` on the runner. Paste the whole file, BEGIN and END lines included. |

Everything else is non-secret and committed in `stack.env`.

## Why this is its own stack

It is a static SPA. `http.service.ts` builds every request from
`environment.apiUrl`, and that URL is dereferenced **only by the browser**.
There is no SSR, no `server.ts`, and no server-side call to the backend.

So there is nothing for a shared Docker network to do: a container name like
`http://eudiw-verifier:8080` would be meaningless to a phone. `HOST_API` has to
be the public URL either way, which is the same reasoning that kept the issuer
frontend standalone.

The practical benefit is that redeploying a UI change does not touch the
container holding the verifier's access certificate and registration
certificate.

## Routing

    VIRTUAL_HOST=demo.eudiw.grnet.gr
    VIRTUAL_PATH=/verifier-ui/
    VIRTUAL_DEST=/

`/verifier-ui/` is a sibling of the backend's `/verifier/`, not a child. The
backend already holds `/verifier/ui`, `/verifier/wallet` and
`/verifier/utilities`, so the UI cannot take `/verifier/` without ambiguity.

`/verifier/` for the UI and `/verifier-api/` for the backend would read better
and match the issuer pair's `/issuer/` and `/frontend/`. It was declined because
the backend's `publicUrl` is signed into every request object it has issued, so
moving it invalidates them. The name is the cheaper compromise.

`VIRTUAL_DEST=/` strips the prefix, so nginx inside the container serves at its
own root.

## The base href, and why it needs rewriting

**This is the one thing that makes this service different from the issuer
frontend**, and it is worth understanding before changing the path.

Angular bakes `<base href="/">` into `index.html` at build time. Behind a path
prefix the browser resolves every relative asset against that base, so
`chunk-ABC.js` is fetched from `https://demo.eudiw.grnet.gr/chunk-ABC.js` — the
host root, which belongs to the status list. The page returns 200 and then
renders blank with 404s in the console.

The issuer frontend does not have this problem because it is Flask rendering
templates server-side, where `url_for()` honours `SCRIPT_NAME`.

Two ways to fix it: rebuild with `ng build --base-href`, which bakes the prefix
into the image and makes it deployment-specific, or rewrite it at request time.
This stack does the second, in `nginx/templates/nginx.conf.template`:

    sub_filter '<base href="/">' '<base href="$BASE_HREF">';
    sub_filter_once off;

The image stays prefix-agnostic and the path is a `stack.env` change.

`sub_filter_once off` matters: the API URL and the base href are two different
replacements, and with `once on` only the first in each response is applied.

**`BASE_HREF` must match `VIRTUAL_PATH`,** slashes included. Nothing enforces it
at deploy time, so the verify step checks the served HTML carries the right base
href rather than trusting the configuration.

The `Dockerfile` sets `ENV BASE_HREF=/` so the image still runs with the
variable unset. Without that default, nginx's envsubst leaves the literal
`$BASE_HREF` in the config and the container fails to start with
`unknown "base_href" variable` — found by testing, not by reading.

## Configuration

| Variable | What it does |
| --- | --- |
| `HOST_API` | Where the browser reaches the verifier backend. Substituted into the served JavaScript by `sub_filter`, replacing the `http://localhost:8080` baked in at build time. |
| `BASE_HREF` | Rewrites Angular's `<base href>`. Must match `VIRTUAL_PATH`. |

Both are applied at **request time**, not container start, so the image is
repointable without a rebuild.

`set-env.js` generates `src/environments/environment.ts` from the tracked `.env`
during `ng build`. That file sets `DOMAIN_NAME=http://localhost:8080`, which is
exactly the string `sub_filter` replaces. The two mechanisms look contradictory
and are not: build-time bakes a known placeholder, runtime rewrites it.

The API URL lands in a lazy-loaded `chunk-*.js`, not `main-*.js`. Worth knowing
if you go looking for it.

## What the verify step checks

- the container is running
- `nginx -t` passes
- `/verifier-ui/` returns 200 through the proxy
- the served HTML carries `<base href="/verifier-ui/">`
- all six sibling services on the hostname still return 200

The base href check is the one that catches a misconfiguration nothing else
would: the page serves fine and only fails in a browser.

## No healthcheck

nginx has no shell-free constraint, so one would be possible, but there is
nothing useful to check beyond "does it serve a file", which the deploy already
verifies through the proxy. Matching the other stacks here.
