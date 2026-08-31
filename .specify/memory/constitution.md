<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 -> 1.0.1
Bump rationale: PATCH. No principle, section, or governance rule changed. This
amendment corrects a note in this report that had become false: the tooling gap
it described was closed on 2026-08-31.

Modified principles: none.
Added sections: none.
Removed sections: none.

Amendment history:
- 1.0.1 (2026-08-31) - Report correction only; governing text unchanged.
- 1.0.0 (2026-08-31) - Initial ratification. The file previously held only
  unfilled `[PLACEHOLDER]` tokens, so 1.0.0 was the first governing version
  rather than an amendment. Placeholders were resolved as:
    [PRINCIPLE_1_NAME] -> I. Test-First Development (NON-NEGOTIABLE)
    [PRINCIPLE_2_NAME] -> II. Clean Architecture & Dependency Direction
    [PRINCIPLE_3_NAME] -> III. SOLID & Clean Code
    [PRINCIPLE_4_NAME] -> IV. Consistent Agent Experience
    [PRINCIPLE_5_NAME] -> V. Performance & Rate-Limit Discipline
    [SECTION_2_NAME]   -> Technology & Integration Constraints
    [SECTION_3_NAME]   -> Development Workflow & Quality Gates
    [GOVERNANCE_RULES] -> Governance body (amendment, versioning, compliance)

Deferred items:
- RESOLVED 2026-08-31. Was: `package.json` had no `test` script and the repo
  contained zero test files, leaving Principle I and Gate 3 unenforceable.
  `pnpm test`, `pnpm typecheck`, and `pnpm test:coverage` now exist; the
  Principle I backfill of src/client.ts, src/utils/pagination.ts,
  src/utils/period.ts, and src/tools/analytics.ts is complete at 100% coverage
  for src/utils/** and src/client.ts; Gate 4 is enforced by bunfig.toml. Four
  known defects are pinned as `it.failing` tests awaiting a separate fix.
- OPEN. RATIFICATION_DATE is inferred from the initial commit (13e353b,
  2026-02-25) rather than from an explicit adoption record. Correct it in a
  further PATCH amendment if the project considers another date canonical.
-->

# wallet-mcp Constitution

## Core Principles

### I. Test-First Development (NON-NEGOTIABLE)

Red-Green-Refactor is the only accepted development cycle. A test that expresses the
desired behavior MUST be written and MUST be observed failing before any production code
is written to satisfy it. Implementation that arrives before its test is rejected in
review regardless of quality.

- `bun:test` is the mandated runner; `pnpm test` MUST map to `bun test`. No second test
  framework may be introduced without an amendment.
- Every commit that adds or changes behavior MUST carry its tests in the same commit.
- Unit tests MUST NOT perform network I/O. `fetch` is stubbed, and fixtures MUST be
  derived from the published OpenAPI schema rather than invented by hand.
- Backfill debt is explicit and time-boxed: `src/client.ts`, `src/utils/pagination.ts`,
  `src/utils/period.ts`, and `src/tools/analytics.ts` MUST reach the coverage gate before
  the next feature is merged. New work proceeds under strict TDD in the meantime.

Rationale: this server sits between an LLM and a user's real financial data. A silent
aggregation error is indistinguishable from a correct answer to the person reading it,
so correctness has to be proven mechanically, not observed anecdotally.

### II. Clean Architecture & Dependency Direction

The codebase is layered and dependencies point in one direction only:
transport (`src/index.ts`) → tool handlers (`src/tools/**`) → API adapter (`src/client.ts`)
→ types (`src/types/**`). Pure utilities (`src/utils/**`) are depended upon by all layers
and depend on nothing.

- `src/client.ts` is the ONLY module permitted to call `fetch` or construct a request URL.
  A `fetch` call anywhere else is a defect, not a shortcut.
- Tool handlers MUST NOT import MCP transport types. They accept validated plain inputs
  and return plain data; `src/index.ts` alone owns protocol framing.
- Business logic — period resolution, pagination control flow, aggregation — MUST be pure
  and I/O-free so it is testable without mocks. Functions that both fetch and aggregate
  MUST be split.
- Adding a tool follows the sequence in `CLAUDE.md`: Zod schema → handler → registration →
  README entry → example prompt.

Rationale: a single seam at `client.ts` means an upstream auth or error-format change
touches exactly one file, and it lets every other layer be tested without a network.

### III. SOLID & Clean Code

- TypeScript `strict` is permanently on. The `any` type is forbidden; use `unknown` plus
  explicit narrowing, or define the type in `src/types/api.ts`.
- Named exports only. Default exports are forbidden.
- **Single Responsibility**: one exported function does one thing. A handler that fetches,
  aggregates, and formats is three functions.
- **Open/Closed**: new capabilities arrive as new registered tools, never as a new branch
  in an existing dispatch conditional.
- **Dependency Inversion**: consumers depend on function signatures, not concrete
  transports — `fetchAllPages` taking a `fetcher` callback is the reference pattern.
- `pnpm lint` (Biome) MUST pass with zero errors and zero warnings. Commented-out code is
  deleted, not shipped. Comments are American English and explain *why*, never *what*.

Rationale: this is a small codebase where every module is read far more often than it is
written, most often by an agent with limited context. Predictable structure is what makes
partial reading safe.

### IV. Consistent Agent Experience

The consumer of this server is an LLM, and consistency of the tool surface is the
equivalent of UI consistency for a human product.

- Tool results MUST be plain `JSON.stringify(data)` inside a text content block. Markdown,
  prose framing, and pre-formatted tables are forbidden — presentation belongs to the client.
- Failures MUST return the single typed shape `{ error, message }` produced by `client.ts`.
  Raw exceptions and stack traces MUST NOT reach the client.
- Naming is uniform: tool names are `snake_case` verb-noun (`list_accounts`,
  `get_top_payees`); parameters are `camelCase`.
- Every tool input MUST be validated by a Zod schema in `src/types/tools.ts`. Hand-rolled
  argument checking is forbidden.
- `agentHints` are surfaced verbatim. `rate_limit.warning`, `pagination.has_more`, and
  partial-match hints MUST NOT be swallowed, so the model can reason about them.
- Tool descriptions MUST state what is returned, the units of any amount, and the date
  semantics, because the model chooses tools from descriptions alone.
- Changing an existing tool's response shape or parameter contract is a breaking change:
  it requires a MAJOR version bump and a README update in the same PR.

Rationale: an LLM cannot ask a clarifying question about an inconsistent field name — it
guesses, and a wrong guess becomes a wrong answer about someone's money.

### V. Performance & Rate-Limit Discipline

The upstream budget is 500 requests per hour per token. That budget is a hard design
constraint, not an operational detail.

- Any code path capable of issuing an unbounded number of requests is a defect.
- The 20-page hard cap in `src/utils/pagination.ts` MUST remain. Raising or removing it
  requires a constitution amendment, not a code review.
- Analytics tools auto-paginate because totals and percentages are wrong without the full
  set. `search_records` MUST stay single-page and cursor-based, exposing `offset`/`limit`.
- Requests MUST use the largest page size the endpoint honors (records: up to 200; the
  accounts endpoint returns 20 regardless) to minimize round trips.
- In-memory aggregation MUST be single-pass and O(n) over the record set. Nested iteration
  over records is forbidden.
- The upstream 370-day maximum date range MUST be enforced by callers by splitting the
  request, never by silently truncating the period.
- Every new tool MUST document its worst-case request count in `README.md`.

Rationale: exhausting the hourly quota does not degrade the product, it removes it — every
subsequent tool call in the session fails until the window resets.

## Technology & Integration Constraints

**Stack (fixed):** Bun runtime, pnpm as the only package manager (never npm or yarn), ESM
modules, TypeScript with `strict: true` and `moduleResolution: "bundler"`. Changing
`moduleResolution` to `node16`/`nodenext` requires adding `.js` extensions to every
relative import and is therefore an amendment-level decision.

**Upstream API — authoritative sources:**

- Prose reference: `https://rest.budgetbakers.com/wallet/reference`
- OpenAPI JSON: `https://rest.budgetbakers.com/wallet/openapi`
- Swagger UI: `https://rest.budgetbakers.com/wallet/openapi/ui`

Types in `src/types/api.ts` MUST be derived from the OpenAPI document, never inferred from
a sample response. Where the prose reference and the OpenAPI document disagree, the
OpenAPI document wins and the discrepancy is noted in the PR.

**Documented upstream constraints that code MUST respect:** `accountId` is mandatory on the
records endpoint (cross-account analytics therefore fan out per account); `limit` defaults
to 30 and maxes at 200, except the accounts endpoint which returns 20 per page regardless;
`withTotal=true` yields a `total` field for verifying a complete drain; there are no
single-resource endpoints, so `GET /accounts/{id}` is a 404; a 409 means the account is
still performing its initial sync; text filters use the `contains-i.` prefix and range
filters use `gte.`/`lte.`.

**Secrets and I/O channels:** `WALLET_API_TOKEN` is required and the server MUST exit with
a clear message at startup when it is absent. The token MUST NEVER be logged, echoed in an
error message, or committed in a test fixture. `WALLET_API_URL` is optional and exists for
pointing at a test endpoint. `stdout` is reserved exclusively for the MCP protocol; all
diagnostics, warnings, and errors go to `stderr`.

## Development Workflow & Quality Gates

Every change MUST clear these gates, in order, before merge. A failing gate blocks the
merge; it is not waived by reviewer discretion.

1. **Lint** — `pnpm lint` passes with zero errors and zero warnings.
2. **Types** — `tsc --noEmit` is clean and the diff introduces no `any`.
3. **Tests** — `pnpm test` is green, and the tests were demonstrably written first.
4. **Coverage** — 100% of lines and branches for `src/utils/**` and the HTTP error mapping
   in `src/client.ts`; at least 80% of lines project-wide. The stdio transport wiring in
   `src/index.ts` is exempt from the line threshold, since covering it measures the SDK
   rather than this project.
5. **Docs** — any tool added, removed, or changed is reflected in `README.md` (tool entry,
   example prompt, worst-case request count) in the same PR.

Commits are English and follow Conventional Commits (`feat:`, `fix:`, `chore:`,
`refactor:`, `test:`, `docs:`). Work branches off `main`; direct commits to `main` are
avoided.

Code review MUST explicitly confirm compliance with Principles I–V rather than assume it.
Feature work follows the Spec Kit flow — `/speckit-specify` → `/speckit-plan` →
`/speckit-tasks` → `/speckit-implement` — and the generated `plan.md` MUST contain a
Constitution Check section evaluated against this document.

## Governance

This constitution supersedes all other development practices, conventions, and habits in
this repository. Where `CLAUDE.md` and this constitution conflict, the constitution
prevails and `CLAUDE.md` MUST be corrected in the same PR that surfaces the conflict.
`CLAUDE.md` remains the day-to-day runtime guidance for agents; this file is the law that
guidance must conform to.

**Amendment procedure.** An amendment is a pull request that modifies this file and
contains: the rationale for the change, the new version number, the updated Sync Impact
Report at the top of the file, and a migration note describing what existing code or
process must change to comply. Amendments MUST NOT be bundled with feature work.

**Versioning policy** (semantic versioning of governance):

- **MAJOR** — a principle is removed, or redefined in a way that invalidates code or
  process that previously complied.
- **MINOR** — a new principle or section is added, or existing guidance is materially
  expanded to constrain something it did not constrain before.
- **PATCH** — clarification, rewording, typo correction, or a non-semantic refinement.

**Compliance review.** Compliance is verified at two checkpoints: the Constitution Check
section of every `plan.md`, and every pull request review. A deviation is permissible only
when it is recorded in the plan's Complexity Tracking section with the simpler alternative
named and the reason it was rejected. Complexity that is not justified in writing is
rejected by default.

**Version**: 1.0.1 | **Ratified**: 2026-02-25 | **Last Amended**: 2026-08-31
