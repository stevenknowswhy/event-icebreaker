# Local Preflight — Not Opsera Evidence

Date: 2026-07-24
Repository base: `447807ec968c` plus the uncommitted Warm Path working tree

This record is a local engineering preflight. It does not replace the Opsera
execution IDs and exported reports required in `docs/opsera/README.md`.

| Check | Result |
| --- | --- |
| TypeScript `tsc --noEmit` | pass |
| ESLint | pass |
| Web unit tests | 27 pass |
| vinext production build | pass; 4 pages and 2 API routes |
| Server-render tests | 4 pass |
| Python Ruff | pass |
| Python pytest | 16 pass |
| Sender/receiver mobile flow | pass; 0 console issues |
| Warm Path + approved action mobile flow | pass; 0 console issues |
| Node production dependency audit | 0 vulnerabilities |
| Full Node audit at high threshold | 0 high or critical; 4 moderate dev-only findings inherited through `drizzle-kit` |
| Python dependency consistency | 141 packages compatible |
| Common committed-secret prefix search | no matches |
| Whitespace/diff check | pass |

The remaining four moderate Node findings are in the pre-existing
`drizzle-kit` development-only esbuild chain. They are not included in the
production dependency tree. A forced audit fix proposes a breaking downgrade,
so it was not applied without a database-tooling migration. Opsera should still
report and disposition them independently.
