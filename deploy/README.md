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

## The base href, and why the proxy rewrites it

**This is the one thing that makes this service different from the issuer
frontend**, and it is worth understanding before changing the path.

Angular emits relative asset references (`styles-X.css`, no leading slash) and a
`<base href="/">` in `index.html`. The browser resolves the assets against that
base, not against the page URL. Behind a prefix the base has to carry the prefix
or every stylesheet and script is fetched from the host root, which here is the
status list. The page returns 200 and renders blank with 404s in the console.

The issuer frontend has the same class of problem for a different reason: its
Flask `url_for('static')` emits absolute `/static/...` because nothing sets the
WSGI `SCRIPT_NAME`. It is fixed the same way, with a `sub_filter` in the wallet
provider's compose.

**The fix lives in `eudi-srv-wallet-provider`, not here.** That stack owns
nginx-proxy and the `proxy-vhost` volume, and its `deploy/compose.yaml` mounts a
per-path location file:

    /etc/nginx/vhost.d/demo.eudiw.grnet.gr_<sha1 of VIRTUAL_PATH>_location

        sub_filter '<base href="/">' '<base href="/verifier-ui/">';
        sub_filter_types text/html;
        sub_filter_once off;

so the rewrite happens on the way out of the proxy and this repository keeps
**zero drift from upstream**. The `Dockerfile` and `nginx.conf.template` here
are byte-identical to upstream's.

Two alternatives were tested and rejected, both of which work:

- `ARG BASE_HREF` plus `ng build --base-href`, set from `docker-build.yml`. One
  upstream file changed, but the image becomes specific to the path it was
  built for.
- A second `sub_filter` in `nginx/templates/nginx.conf.template` plus
  `ENV BASE_HREF=/` in the `Dockerfile`, so the image stays path-agnostic. Two
  upstream files changed.

The cost of the chosen approach is that this service's routing is configured in
another repository, alongside the `/.well-known/` rewrites that are there for
the same structural reason.

**Consequence for deploy order:** the wallet provider must be deployed before
this stack, or the UI serves a page whose assets all 404.

**The sha1 must match `VIRTUAL_PATH` exactly.** `printf '%s' '/verifier-ui/' |
shasum`, no trailing newline. A wrong hash is silently ignored by nginx-proxy,
so nothing errors and the page is simply broken.

## Configuration

| Variable | What it does |
| --- | --- |
| `HOST_API` | Where the browser reaches the verifier backend. Substituted into the served JavaScript by the image's own `sub_filter`, replacing the `http://localhost:8080` baked in at build time. |

The base href is not a variable here; it is rewritten by the proxy, in the
wallet provider's stack. See above.

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
