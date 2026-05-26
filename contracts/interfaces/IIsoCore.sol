// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IsoTypes} from "../IsoTypes.sol";

interface IIsoCore {
    function getPolicyRule(uint64 orgId, IsoTypes.ProposalType proposalType) external view returns (IsoTypes.PolicyRule memory);
    function getPolicyRuleAtVersion(uint64 orgId, IsoTypes.ProposalType proposalType, uint64 version) external view returns (IsoTypes.PolicyRule memory);
    function isOrganizationActive(uint64 orgId) external view returns (bool);
    function isOrganizationFinalized(uint64 orgId) external view returns (bool);
    function isOrganizationAdmin(uint64 orgId, address actor) external view returns (bool);
    function hasRole(uint64 orgId, address actor, IsoTypes.RoleType roleType, IsoTypes.ProposalType proposalType) external view returns (bool);
    function canActOnProposalType(uint64 orgId, address actor, uint64 bodyId, IsoTypes.RoleType roleType, IsoTypes.ProposalType proposalType) external view returns (bool);
    function isBodyMember(uint64 orgId, address actor, uint64 bodyId) external view returns (bool);
    function bodyBelongsToOrg(uint64 orgId, uint64 bodyId) external view returns (bool);
}
