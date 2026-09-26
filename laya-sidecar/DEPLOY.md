# Deploy checklist — Laya sidecar

Deploy happens by hand (Stefano's accounts, Stefano's credentials) — nothing in this
repo deploys itself. Target shape per the approved spec: **one small always-on
container behind public HTTPS**, Fly.io-class. The demo must survive judges' phones
on venue Wi-Fi, so reachability matters more than size.

The image bakes the checkpoint weights (`HF_HUB_OFFLINE=1`): a cold boot downloads
nothing. Expect a ~2.5–3 GB image and a ~30 s model load on boot — hence *always-on*,
not scale-to-zero.

## 1 · Build and verify the image

```bash
cd laya-sidecar
docker build -t laya-sidecar .
docker run --rm laya-sidecar pytest -q      # 100 tests against the baked weights
docker run --rm -p 8080:8080 -e LAYA_ALLOWED_ORIGINS=https://your-app.pages.dev laya-sidecar
curl localhost:8080/health                  # 503 while warming → 200 {"status":"ok"}
```

## 2 · Push to the registry and create the app (Fly.io shown; any always-on host works)

```bash
fly launch --no-deploy            # choose: no database, no volumes
fly scale vm shared-cpu-1x --memory 2048   # model + torch need headroom; 1 GB OOMs
fly secrets set LAYA_ALLOWED_ORIGINS=https://your-app.pages.dev
fly deploy
```

`LAYA_ALLOWED_ORIGINS` must list the exact app origin(s) the QR links are opened
from — CORS is allowlist-only, and an empty list means same-origin requests only.
Do not set `LAYA_MODEL_ID`; the English root checkpoint is the launch default.

## 3 · Verify from the outside, before demo day

- [ ] `GET https://<host>/health` returns 200 from a phone **on cellular data** (not the venue Wi-Fi).
- [ ] First `/v1/match/deep` call after boot returns a dossier in one round-trip (warm-up primes it; the client aborts at 2.5 s — see the latency note in EVAL.md, p50 ≈ 1 s on sandbox CPU).
- [ ] A request from a non-allowlisted origin is refused by CORS.
- [ ] An oversized body (> 32 KiB) is rejected with 413.
- [ ] No profile text appears anywhere in the host's logs (the sidecar logs lifecycle events only — spot-check `fly logs` while sending a real request).
- [ ] Restart the app once; `/health` goes 503 → 200 and no state survived (there is nothing to survive).

## 4 · Point the app at it

Set `NEXT_PUBLIC_LAYA_URL=https://<host>` in the app's Cloudflare deployment and
redeploy the app. With the variable unset or the host down, the app renders its
"local estimate" dossier — the demo works either way, but the rich read needs this.

## 5 · Rollback and teardown

The sidecar is stateless: rollback is redeploying the previous image, teardown is
deleting the app. There is no data to migrate because nothing was ever stored.
