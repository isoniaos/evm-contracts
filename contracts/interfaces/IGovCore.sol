// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GovTypes} from "../GovTypes.sol";

interface IGovCore {
    function getPolicyRule(uint64 orgId, GovTypes.ProposalType proposalType) external view returns (GovTypes.PolicyRule memory);
    function getPolicyRuleAtVersion(uint64 orgId, GovTypes.ProposalType proposalType, uint64 version) external view returns (GovTypes.PolicyRule memory);
    function isOrganizationActive(uint64 orgId) external view returns (bool);
    function isOrganizationAdmin(uint64 orgId, address actor) external view returns (bool);
    function hasRole(uint64 orgId, address actor, GovTypes.RoleType roleType, GovTypes.ProposalType proposalType) external view returns (bool);
    function canActOnProposalType(uint64 orgId, address actor, uint64 bodyId, GovTypes.RoleType roleType, GovTypes.ProposalType proposalType) external view returns (bool);
    function isBodyMember(uint64 orgId, address actor, uint64 bodyId) external view returns (bool);
    function bodyBelongsToOrg(uint64 orgId, uint64 bodyId) external view returns (bool);
}
