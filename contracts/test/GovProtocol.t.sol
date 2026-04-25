// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {GovCore} from "../GovCore.sol";
import {GovProposals} from "../GovProposals.sol";
import {DemoTarget} from "../DemoTarget.sol";
import {GovTypes} from "../GovTypes.sol";
import {BodyDoesNotBelongToOrg, DataHashMismatch, InvalidProposalStatus} from "../GovErrors.sol";

contract GovProtocolTest is Test {
    GovCore private govCore;
    GovProposals private govProposals;
    DemoTarget private demoTarget;
    address private orgAdmin = address(0xA11CE);
    address private foreignAdmin = address(0xBEEF);
    address private proposer = address(0xB0B);
    address private approver = address(0xCAFE);
    address private executor = address(0xD00D);
    address private revokedHolder = address(0xABCD);
    address private expiringHolder = address(0xF00D);
    uint64 private orgId;
    uint64 private bodyId;
    uint64 private foreignOrgId;
    uint64 private foreignBodyId;

    function setUp() public {
        govCore = new GovCore();
        demoTarget = new DemoTarget(address(this));
        govProposals = new GovProposals(address(govCore), address(demoTarget));
        demoTarget.setGovProposals(address(govProposals));
        orgId = govCore.createOrganization("alpha", "ipfs://alpha", orgAdmin);
        foreignOrgId = govCore.createOrganization("beta", "ipfs://beta", foreignAdmin);
        vm.prank(orgAdmin);
        bodyId = govCore.createBody(orgId, GovTypes.BodyKind.GeneralCouncil, "ipfs://body");
        vm.prank(foreignAdmin);
        foreignBodyId = govCore.createBody(foreignOrgId, GovTypes.BodyKind.SecurityCouncil, "ipfs://foreign-body");
        _configureRole(orgId, bodyId, GovTypes.RoleType.Proposer, proposer);
        _configureRole(orgId, bodyId, GovTypes.RoleType.Approver, approver);
        _configureRole(orgId, bodyId, GovTypes.RoleType.Executor, executor);
        vm.prank(orgAdmin);
        govCore.setPolicyRule(orgId, GovTypes.ProposalType.Standard, _singleBodyArray(bodyId), _emptyBodyArray(), bodyId, 0, true);
    }

    function testFuzz_ProposalExecutionPersistsDemoState(uint256 newNumber) public {
        uint64 proposalId = _createStandardProposal(newNumber);
        vm.prank(approver);
        govProposals.approveProposal(orgId, proposalId, bodyId);
        bytes memory actionData = _numberAction(newNumber);
        vm.prank(executor);
        govProposals.executeProposal(orgId, proposalId, actionData);
        assertEq(demoTarget.number(), newNumber);
        assertEq(demoTarget.lastOrgId(), orgId);
        assertEq(demoTarget.lastActionHash(), keccak256(actionData));
    }

    function testFuzz_RevokedMandateNeverAuthorizes(uint8 proposalTypeSeed) public {
        GovTypes.ProposalType proposalType = _proposalTypeFromSeed(proposalTypeSeed);
        uint64 mandateRoleId = _createRole(orgId, bodyId, GovTypes.RoleType.Approver, "ipfs://temp-role");
        uint64 mandateId = _assignMandate(orgId, mandateRoleId, revokedHolder, _mask(proposalType));
        assertTrue(govCore.canActOnProposalType(orgId, revokedHolder, bodyId, GovTypes.RoleType.Approver, proposalType));
        vm.prank(orgAdmin);
        govCore.revokeMandate(orgId, mandateId);
        assertFalse(govCore.canActOnProposalType(orgId, revokedHolder, bodyId, GovTypes.RoleType.Approver, proposalType));
    }

    function testFuzz_ExpiredMandateCannotAuthorize(uint32 duration) public {
        uint64 boundedDuration = uint64(bound(uint256(duration), 1, 30 days));
        uint64 roleId = _createRole(orgId, bodyId, GovTypes.RoleType.Vetoer, "ipfs://veto-role");
        _assignTimedMandate(orgId, roleId, expiringHolder, uint64(block.timestamp), uint64(block.timestamp) + boundedDuration, _mask(GovTypes.ProposalType.Standard));
        vm.warp(block.timestamp + boundedDuration + 1);
        assertFalse(govCore.canActOnProposalType(orgId, expiringHolder, bodyId, GovTypes.RoleType.Vetoer, GovTypes.ProposalType.Standard));
    }

    function testFuzz_DataHashMismatchPreventsExecution(uint256 expectedNumber, uint256 actualNumber) public {
        vm.assume(expectedNumber != actualNumber);
        uint64 proposalId = _createStandardProposal(expectedNumber);
        vm.prank(approver);
        govProposals.approveProposal(orgId, proposalId, bodyId);
        vm.expectRevert(abi.encodeWithSelector(DataHashMismatch.selector, keccak256(_numberAction(expectedNumber)), keccak256(_numberAction(actualNumber))));
        vm.prank(executor);
        govProposals.executeProposal(orgId, proposalId, _numberAction(actualNumber));
    }

    function testFuzz_ProposalCannotExecuteTwice(uint256 newNumber) public {
        uint64 proposalId = _createStandardProposal(newNumber);
        bytes memory actionData = _approveAndExecute(proposalId, newNumber);
        assertEq(demoTarget.lastActionHash(), keccak256(actionData));
        vm.expectRevert(abi.encodeWithSelector(InvalidProposalStatus.selector, GovTypes.ProposalStatus.Executed));
        vm.prank(executor);
        govProposals.executeProposal(orgId, proposalId, actionData);
    }

    function test_RevertsWhen_ForeignBodyUsedInPolicy() public {
        vm.expectRevert(abi.encodeWithSelector(BodyDoesNotBelongToOrg.selector, orgId, foreignBodyId));
        vm.prank(orgAdmin);
        govCore.setPolicyRule(orgId, GovTypes.ProposalType.Treasury, _singleBodyArray(foreignBodyId), _emptyBodyArray(), bodyId, 1 hours, true);
    }

    function _approveAndExecute(uint64 proposalId, uint256 newNumber) internal returns (bytes memory actionData) {
        vm.prank(approver);
        govProposals.approveProposal(orgId, proposalId, bodyId);
        actionData = _numberAction(newNumber);
        vm.prank(executor);
        govProposals.executeProposal(orgId, proposalId, actionData);
    }

    function _createStandardProposal(uint256 newNumber) internal returns (uint64 proposalId) {
        bytes memory actionData = _numberAction(newNumber);
        vm.prank(proposer);
        proposalId = govProposals.createProposal(orgId, GovTypes.ProposalType.Standard, address(demoTarget), 0, keccak256(actionData), "ipfs://proposal");
    }

    function _configureRole(uint64 targetOrgId, uint64 targetBodyId, GovTypes.RoleType roleType, address holder) internal {
        uint64 roleId = _createRole(targetOrgId, targetBodyId, roleType, "ipfs://role");
        _assignMandate(targetOrgId, roleId, holder, _mask(GovTypes.ProposalType.Standard));
    }

    function _createRole(uint64 targetOrgId, uint64 targetBodyId, GovTypes.RoleType roleType, string memory metadataUri) internal returns (uint64 roleId) {
        vm.prank(orgAdmin);
        roleId = govCore.createRole(targetOrgId, targetBodyId, roleType, metadataUri);
    }

    function _assignMandate(uint64 targetOrgId, uint64 roleId, address holder, uint256 proposalTypeMask) internal returns (uint64 mandateId) {
        vm.prank(orgAdmin);
        mandateId = govCore.assignMandate(targetOrgId, roleId, holder, uint64(block.timestamp), 0, proposalTypeMask, 0);
    }

    function _assignTimedMandate(
        uint64 targetOrgId,
        uint64 roleId,
        address holder,
        uint64 startTime,
        uint64 endTime,
        uint256 proposalTypeMask
    ) internal returns (uint64 mandateId) {
        vm.prank(orgAdmin);
        mandateId = govCore.assignMandate(targetOrgId, roleId, holder, startTime, endTime, proposalTypeMask, 0);
    }

    function _numberAction(uint256 newNumber) internal view returns (bytes memory actionData) {
        actionData = abi.encodeCall(DemoTarget.setNumber, (orgId, newNumber));
    }

    function _singleBodyArray(uint64 targetBodyId) internal pure returns (uint64[] memory bodyIds) {
        bodyIds = new uint64[](1);
        bodyIds[0] = targetBodyId;
    }

    function _emptyBodyArray() internal pure returns (uint64[] memory bodyIds) {
        bodyIds = new uint64[](0);
    }

    function _mask(GovTypes.ProposalType proposalType) internal pure returns (uint256 proposalTypeMask) {
        proposalTypeMask = uint256(1) << uint8(proposalType);
    }

    function _proposalTypeFromSeed(uint8 proposalTypeSeed) internal pure returns (GovTypes.ProposalType proposalType) {
        uint8 proposalTypeValue = uint8(bound(uint256(proposalTypeSeed), 1, 4));
        proposalType = GovTypes.ProposalType(proposalTypeValue);
    }
}
