# IsoniaOS Agent Rules

Current active target: v0.8 alpha accountability demo baseline.

The v0.8 contracts scope is a deterministic local accountability demo surface:

- preserve the v0.7 custom IsoniaOS organization/proposal protocol;
- keep `GovProposals` execution limited to the configured demo target;
- keep demo target actions `onlyGovProposals`;
- use demo target events as local onchain proof that a governed target method executed;
- keep `IsoDemoVotesToken` demo-only if present.

Do not treat demo target events as proof that external work was completed. Do not treat the demo votes token as ISO launch tokenomics or production governance eligibility.

Do:

- update CHANGELOG under Unreleased;
- keep package version and dependency refs consistent;
- preserve package boundaries;
- prefer reusable components;
- avoid hardcoded sibling repo paths unless explicitly gated for local workspace mode.

Do not:

- edit archived v0.1 and v0.5 documentation;
- invent new versions;
- tag releases automatically;
- add SaaS-only code to public app-core;
- introduce production/security claims.
