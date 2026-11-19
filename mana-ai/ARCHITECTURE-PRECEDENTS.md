# Local curated architecture precedents, v1

This is an opt-in **local editorial catalogue**, not live Internet discovery or model training. It helps a user discuss design intentions before producing a new plan. It neither generates geometry nor proves that downstream generation has adopted a preference. There are only three records, not a representative architectural corpus.

```js
const {lookupPrecedents}=require('./src/architecture/precedents.cjs');
const result=lookupPrecedents({optIn:true,priorities:['privacy','daylight'],limit:3});
```

Allowed tags: privacy, daylight, courtyard, narrow_site, indoor_outdoor. Unknown fields (including briefs/addresses) are rejected. No HTTP library, network request, persistence, model, images or source floor-plan coordinates. Opt-in must be explicit in a future UI. Rank is tag overlap only, not quality. A renderer should use textContent, label each source link, and allow HTTPS only; no source HTML is shipped.

## Evidence and source reliability

Pages read on 2026-11-19 using public research, with synthetic generic queries only:

- [Sanctuary House, Hajizadeh and Associates](https://hajizadehs.com/featured_item/sanctuary-house/): architect's first-party account of private/public zoning and two inner courtyards. Project date 2024; built status not established. Author intent is not measured daylight/thermal performance. Publisher explicitly reserves rights.
- [Aban House, Aga Khan Award for Architecture](https://the.akdn/sgh/en/how-we-work/our-agencies/aga-khan-trust-culture/akaa/aban-house): award organisation's project record attributes USE Studio / Mohammad Arab and Mina Moeineddini, completion 2018 and three courtyards on a narrow site. It provides credited photographs/floor plans, but no asset reuse permission was verified. Award listing is not regulatory approval.
- [Narrow House, Only If Architecture](https://www.only-if.com/portfolio/1502/?id=2): architect's first-party account, completed 2021. Explains the central stair lightwell and split levels in a constrained urban lot. This is a specific US project, not an Iranian code precedent. Publisher has a copyright notice.

Short factual paraphrases are separate from explicitly labelled **our design inferences/tradeoffs**. No images, geometry, detailed layout, original prose or drawing files are copied. Public availability is not a reuse license; no plan/image license is granted by this module. Do not scrape, download, redistribute or train on source assets through this feature. No professional-compliance or performance guarantee is inferred.

## Integration gate

Display provenance and caveats with every recommendation. Ask the user to choose an abstract strategy; do not claim lasting preference learning unless a separately consented preference record exists. A real generation step must record chosen strategy IDs, actual applied constraints, conflicts, source attribution and tests in its receipt. A diagram unchanged by the preference must not be described as source-informed bespoke design. Validate site dimensions, adjacency, orientation/neighbours, daylight/ventilation, egress/accessibility and local professional review independently. This increment does not yet satisfy that generation gate.

Future live discovery is separate: provider adapter, explicit network disclosure, synthetic-only queries, provenance/time checks, permissions/license review, bounded requests, no brief transmission and independent evaluation. Curated matches must never be presented as live search.

## Test

`node --test mana-ai/tests/architecture-precedents.test.cjs`

Four focused tests: opt-in/schema bounds; relevance and honest capability flags; deterministic attribution/rights/isolation; operation with fetch forbidden. No server deployment or full-repository acceptance claimed.

## Separate opt-in live discovery adapter

`src/architecture/precedent-discovery.cjs` exports:

```js
await discoverPrecedents({optIn:true,theme:'courtyard_privacy',endpoint:'http://127.0.0.1:8795/search'});
```

Other fixed themes: `narrow_daylight`, `indoor_outdoor`. No custom query, user dimensions, address, identity or full brief accepted. The operator-configured literal loopback HTTP SearXNG `/search` service receives only a fixed generic query; **SearXNG can send that query onward to external search engines**. A UI must explicitly disclose this before opt-in. No real service was contacted during implementation; all adapter tests use mocked transport. Server availability/configuration and actual live results are unverified.

The adapter performs one bounded GET, redirect:error, five-second deadline, 128 KiB response limit, scans at most50 result entries and returns at most5 distinct HTTPS links. Static URL checks reject credential-bearing, non-HTTPS, IP-literal and obvious local/reserved hostnames; this is not DNS verification. Never feed returned links into arbitrary URL fetchers. Returned titles/excerpts are untrusted search text; render only with textContent and safe link attributes, never as HTML or instructions. No result page, image or floor plan is fetched. No claims of reading whole pages, verifying truth/license, extracting a strategy, learning or generating geometry are made.

`SEARCH_COMPLETED_UNVERIFIED` means only that a response was parsed, not research verification. `SEARCH_FAILED` carries an error receipt and zero candidates. Candidates stay separate from the curated catalogue and are never automatically promoted into it. A follow-on evidence/permission review is required before any architecture strategy can use them.

Run mocked tests: `node --test mana-ai/tests/precedent-discovery.test.cjs`. Includes opt-in rejection/no call, fixed query, bounds, hostile URL, oversize, HTTP failure, network failure and stalled transport deadline. A passing mocked test is not evidence of actual Internet discovery.
