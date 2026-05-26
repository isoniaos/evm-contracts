# Target Access Patterns

The contracts under `contracts/demo/targets/` are demo-local compatibility examples. They are not protocol core and they do not loosen target-side security.

## Organization Executor Boundary

`IsoOrgExecutor` is organization-scoped. `IsoProposals` validates the proposal route, target, selector, value, calldata selector, calldata hash, timelock, approvals, vetoes, and executor mandate before forwarding through the executor.

For already-deployed targets, the handoff is explicit:

- Ownable targets transfer ownership to the organization executor.
- AccessControl targets grant target roles to the organization executor.
- AccessManager targets configure selector roles for the organization executor through the manager authority.

The target sees `msg.sender == IsoOrgExecutor`. Fine-grained proposer, approver, vetoer, executor, and emergency splitting is enforced upstream by IsoniaOS policy and mandate checks.

## Ownable Targets

`IsoOwnableTarget` demonstrates a single-owner target after ownership handoff. Direct calls from the former owner or other EOAs fail after ownership is transferred. Governed execution succeeds only when the organization has enabled the target and selector in `IsoProposals`.

## AccessControl Targets

`IsoAccessControlTarget` exposes `OPERATOR_ROLE` and `EMERGENCY_ROLE`. The executor can call only functions backed by roles actually granted to it. Missing target roles surface as failed execution; IsoniaOS does not convert bad target configuration into success.

## AccessManager Targets

`IsoAccessManagedTarget` and `IsoDemoAccessManager` use the OpenZeppelin AccessManager/AccessManaged pattern from the installed dependency. Selector-level authority still belongs to the manager. A selector enabled in IsoniaOS can still fail if the manager has not authorized the executor for that selector.

## Emergency Routes

Demo-local tests and seed data include an emergency proposal type with an emergency body, zero IsoniaOS timelock, and one explicitly allowed emergency selector. That route does not grant arbitrary target access: unconfigured selectors and unconfigured targets still fail before or during execution.

Target events are useful evidence and local test context. They are not protocol authority unless a reviewed protocol design explicitly models them that way.
