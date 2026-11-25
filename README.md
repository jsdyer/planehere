# Plane Here

Identify nearby aircraft from community ADS-B observations. Choose Halifax, Vancouver, Langley, Charlottetown or arbitrary coordinates; compare callsigns, direction, distance, aircraft type, altitude and each position's actual observation time.

The public interface is a static GitHub Pages app at **https://coolcode.ca/planehere/**. Its read-only Cloudflare gateway is in `services/gateway.js`. Aircraft data is from [adsb.lol](https://www.adsb.lol/) under the [Open Database Licence 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The map uses OpenStreetMap and vendored Leaflet (licence in `web/vendor/LEAFLET-LICENSE`).

<!-- coolcode:guide -->
Choose a viewpoint and select Find aircraft. The list shows aircraft nearest first; bearing points from you toward the reported position, while track describes the aircraft's movement. Area observations may be cached for five minutes, and positions older than 15 minutes are hidden. Barometric altitude is not height above your building. Coverage is incomplete; this is a discovery tool, not aviation navigation.
<!-- /coolcode:guide -->

## What is included

- Optional device location or editable latitude/longitude, with 10/25/50 nautical-mile radii.
- Aircraft map and accessible list, nearest first; callsign/registration/type filter and ground-aircraft toggle.
- Feet/knots or metres/km/h, bearing, track, individual position age and exact timestamp.
- Explicitly saved viewpoint in local browser storage, with a forget control.
- CSV export of the currently visible observation, including source and licence. Export is a derived data extract under ODbL; source attributes are preserved.
- Shared five-minute area cache, atomic daily request budget, concurrent-fetch lease and upstream cooldown.
- No route guesses: missing callsigns, model codes, registration or altitude are marked as unreported.

The page never manufactures sample aircraft when the source is unavailable. Its initial empty state makes no ADS-B request. Failed refreshes leave any prior in-tab observation visible with its original dates; old positions disappear according to the configured age limit.

## Key expiry and anonymous access

An adsb.lol key is **optional**. Official [API documentation](https://www.adsb.lol/docs/open-data/api), checked 2026-11-25, lists:

| Access | Published allowance |
| --- | --- |
| No key | 500 requests per day per IP |
| Anonymous key | 30-day key, 500 requests/day |
| Adhoc key | 1,000 requests/day; requested through their form |
| Feeder key | 7,200 requests/day and 20 GB/month |

A key showing one month's validity appears consistent with the anonymous-key tier; that is not proof of the account's actual tier. This app does not require monthly key replacement to use the documented no-key mode. Free access is best effort.

Configure `ADSBLOL_API_KEY` as a **Secret** on the existing CoolCode Worker, never in GitHub or browser source. No new DB binding or manual database migration is required. The gateway reuses `gateway_cache` and `gateway_budget` and creates them if missing.

Optional plain Worker variables:

| Name | Default | Meaning |
| --- | --- | --- |
| `PLANEHERE_AUTH_MODE` | `auto` | `auto`, `key` or `anonymous`. Auto uses a configured key, retries a 401 or an explicit invalid/expired-key 403 anonymously once, then rests the key for one hour. |
| `PLANEHERE_DAILY_LIMIT` | `450` | Shared upstream attempts per UTC day, including failed/authentication-retry attempts. Keep 450 for anonymous/30-day access. Raise only when the actual account tier supports it. |

In `anonymous` mode, an existing key is ignored. In strict `key` mode, failed authentication never falls back. **429 responses never cause a switch to anonymous access.** The provider's `Retry-After` establishes a shared pause for all areas. Anonymous attempts also have an independent 450/day cap even if a higher keyed allowance is configured. Quotas are D1-atomic, not per-isolate counters. Cloudflare may share egress IPs with unrelated callers, so provider limits can still be reached before the local cap.

## Worker integration

`planehereApiHandle(request, env, ctx)` handles:

```text
GET /api/planehere/nearby?lat=44.65&lon=-63.58&radius=25
```

It returns the existing gateway shape `{status?, body, headers?}`. The combined Worker must dispatch this route before its general unknown-endpoint handler and apply its normal CORS/JSON response handling. Only `https://coolcode.ca` is accepted as a browser Origin. Requests without Origin remain usable by public HTTP clients.

The module's three exported functions can be imported for tests. For the dashboard-pasteable combined Worker, remove the `export` keywords during assembly; names are prefixed to avoid collisions. The frontend's service base is `web/config.json`. Do not paste a key into that file.

Requests are rounded to 0.1° and use a common 60-nm source envelope, allowing nearby visitors and all three user radii to share the same result. Exact distance/radius filtering happens in the browser. Each miss has a 20-second D1 lease. Response size and aircraft counts are bounded. Cached rows are limited to 128 for Plane Here; SQL cleanup is scoped to its own prefixes and does not delete other tools' data. Source time older than 15 minutes is rejected rather than relabelled fresh.

Changes to `services/gateway.js` need a reviewed combined Worker deployment. GitHub Pages publication alone cannot update that API. The main CoolCode repository is intentionally unchanged in this round; root integration artifacts/deployment instructions are handled separately.

## Privacy

The browser does not send exact visitor coordinates to the lookup service: it rounds them to one decimal place before requesting an area from CoolCode, which calls adsb.lol. Coordinates are not added to the page URL. Opening the page loads map tiles from OpenStreetMap; map requests reveal the viewed area. Optional device location requires browser permission. A saved viewpoint retains exact coordinates in `coolcode:planehere:viewpoint` on this browser only; Forget saved viewpoint removes it.

No account, cookie or saved aircraft history is required. CSV export is local. Public data responses contain aircraft coordinates, never visitor identifiers or API keys. The shared CoolCode aggregate-open counter excludes tool inputs and query parameters.

## Expand or customize

Edit `web/config.json` to add a new preset without changing application code:

```json
{"id":"victoria","name":"Victoria waterfront","lat":48.4215,"lon":-123.3691}
```

Append it to `presets`; optionally change `defaultPlace` to `victoria`. Any valid global coordinates are accepted independently of the starter list. `defaultRadiusNm` is 10, 25 or 50. `positionMaxAgeSeconds` defaults to 900 and must be 30–3600; the documentation/UI should be updated if this changes. The gateway currently rejects source snapshots older than 900 seconds regardless of the browser's setting. No source refresh is needed for preset changes: run checks and push to `main` to publish.

There is **no scheduled collector**: requests happen only on visitor action. The page has a local timer to update displayed ages; it does not poll the provider. GitHub Actions only tests/builds/publishes. No schedule guard is needed. Operational monitoring should probe the page and the gateway configuration/availability without spending the aircraft allowance on frequent unnecessary live requests.

## Check and publish

Python 3.12+ and Node 24+ are sufficient for app/build tests; there are no npm runtime dependencies.

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
```

The existing **Browser tool · Check and publish** workflow tests at a project subpath in Chromium and deploys successful `main` builds. GitHub Pages source must be **GitHub Actions**. It publishes only `dist/`; the API module and any private files cannot enter the static site. Pull requests check/build without deploying.

The browser smoke uses clearly synthetic network fixtures only inside the test harness. It checks loading, filtering, errors, export, optional saved location, safe rendering and mobile layout. Production contains no fixture results. Gateway tests run actual SQLite SQL using Node's built-in SQLite module and cover expired-key fallback, shared caching, atomic quotas, simultaneous misses, 429 cooldown and stale-source rejection.

## Source references

- [adsb.lol API and limits](https://www.adsb.lol/docs/open-data/api)
- [adsb.lol interactive API](https://api.adsb.lol/docs)
- [Adhoc key request](https://www.adsb.lol/request)
- [Open Database Licence](https://opendatacommons.org/licenses/odbl/1-0/)
- [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/)

See `docs/source-check.json` for a recorded keyless endpoint check. It records only public status/schema/count evidence; no key or personal location is included.
