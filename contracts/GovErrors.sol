// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GovTypes} from "./GovTypes.sol";

error ZeroAddress();
error EmptySlug();
error SlugAlreadyExists();
error OrganizationNotFound(uint64 orgId);
error OrganizationNotActive(uint64 orgId);
error Unauthorized(address actor);
error BodyNotFound(uint64 bodyId);
error BodyDoesNotBelongToOrg(uint64 orgId, uint64 bodyId);
error RoleNotFound(uint64 roleId);
error RoleDoesNotBelongToOrg(uint64 orgId, uint64 roleId);
error MandateNotFound(uint64 mandateId);
error InvalidMandateTimeRange();
error InvalidProposalType();
error PolicyRuleNotEnabled(uint64 orgId, GovTypes.ProposalType proposalType);
error ProposalNotFound(uint64 proposalId);
error ProposalDoesNotBelongToOrg(uint64 orgId, uint64 proposalId);
error InvalidProposalStatus(GovTypes.ProposalStatus current);
error BodyNotRequiredApprover(uint64 bodyId);
error BodyNotVetoer(uint64 bodyId);
error AlreadyApproved(uint64 proposalId, uint64 bodyId);
error AlreadyVetoed(uint64 proposalId, uint64 bodyId);
error MissingRequiredApprovals(uint64 proposalId);
error TimelockNotExpired(uint64 proposalId, uint64 executableAt);
error DataHashMismatch(bytes32 expected, bytes32 actual);
error TargetNotAllowed(address target);
error InvalidOrganizationStatus(GovTypes.OrganizationStatus status);
error InvalidStatusTransition(GovTypes.OrganizationStatus current, GovTypes.OrganizationStatus nextStatus);
error InvalidBodyKind();
error InvalidRoleType();
error InvalidExecutorBody();
error EmptyBatch();
error InvalidExecutionValue(uint256 expected, uint256 actual);
error ExecutionFailed(bytes reason);
