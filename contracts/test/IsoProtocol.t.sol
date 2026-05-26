// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IsoCore} from "../IsoCore.sol";
import {IsoProposals} from "../IsoProposals.sol";
import {DemoTarget} from "../demo/DemoTarget.sol";
import {IsoOrgExecutor} from "../execution/IsoOrgExecutor.sol";
import {IsoTypes} from "../IsoTypes.sol";
import {BodyDoesNotBelongToOrg, DataHashMismatch, InvalidProposalStatus} from "../IsoErrors.sol";
import {ManagedExecutionTarget} from "./ManagedExecutionTarget.sol";

contract IsoProtocolTest is Test {
    bytes32 private constant PROPOSAL_EXECUTED_TOPIC =
        keccak256("ProposalExecuted(uint64,uint64,address,address,uint256,bytes4,bytes32,address)");
    bytes32 private constant MANAGED_CALL_EXECUTED_TOPIC =
        keccak256("ManagedCallExecuted(uint64,uint64,address,address,uint256,bytes4,bytes32)");

    IsoCore private isoCore;
    IsoProposals private isoProposals;
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
        isoCore = new IsoCore();
        demoTarget = new DemoTarget(address(this));
        isoProposals = new IsoProposals(address(isoCore));
        demoTarget.setIsoProposals(address(isoProposals));
        orgId = isoCore.createOrganization("alpha", "ipfs://alpha", orgAdmin);
        foreignOrgId = isoCore.createOrganization("beta", "ipfs://beta", foreignAdmin);
        vm.prank(orgAdmin);
        bodyId = isoCore.createBody(orgId, IsoTypes.BodyKind.GeneralCouncil, "ipfs://body");
        vm.prank(foreignAdmin);
        foreignBodyId = isoCore.createBody(foreignOrgId, IsoTypes.BodyKind.SecurityCouncil, "ipfs://foreign-body");
        _configureRole(orgId, bodyId, IsoTypes.RoleType.Proposer, proposer);
        _configureRole(orgId, bodyId, IsoTypes.RoleType.Approver, approver);
        _configureRole(orgId, bodyId, IsoTypes.RoleType.Executor, executor);
        vm.prank(orgAdmin);
        isoCore.setPolicyRule(orgId, IsoTypes.ProposalType.Standard, _singleBodyArray(bodyId), _emptyBodyArray(), bodyId, 0, true);
        vm.prank(orgAdmin);
        isoProposals.setExecutionTargetRule(orgId, address(demoTarget), true, 0);
        vm.prank(orgAdmin);
        isoProposals.setExecutionSelectorRule(orgId, address(demoTarget), DemoTarget.setNumber.selector, true);
    }

    function testFuzz_ProposalExecutionPersistsDemoState(uint256 newNumber) public {
        uint64 proposalId = _createStandardProposal(newNumber);
        vm.prank(approver);
        isoProposals.approveProposal(orgId, proposalId, bodyId);
        bytes memory actionData = _numberAction(newNumber);
        vm.prank(executor);
        isoProposals.executeProposal(orgId, proposalId, actionData);
        assertEq(demoTarget.number(), newNumber);
        assertEq(demoTarget.lastOrgId(), orgId);
        assertEq(demoTarget.lastActionHash(), keccak256(actionData));
    }

    function test_ProposalExecutedRecordsDirectExecutionReceipt() public {
        uint64 proposalId = _createStandardProposal(76);
        vm.prank(approver);
        isoProposals.approveProposal(orgId, proposalId, bodyId);
        bytes memory actionData = _numberAction(76);
        bytes32 dataHash = keccak256(actionData);
        vm.recordLogs();
        vm.prank(executor);
        isoProposals.executeProposal(orgId, proposalId, actionData);
        Vm.Log[] memory entries = vm.getRecordedLogs();
        _assertProposalExecutedLog(
            entries,
            address(isoProposals),
            orgId,
            proposalId,
            executor,
            address(demoTarget),
            0,
            DemoTarget.setNumber.selector,
            dataHash,
            address(0)
        );
    }

    function test_ManagedExecutorCallsFinalTargetAsOrgExecutor() public {
        IsoOrgExecutor orgExecutor = new IsoOrgExecutor(address(isoProposals), orgId);
        vm.prank(orgAdmin);
        isoProposals.setOrgExecutor(orgId, address(orgExecutor));
        ManagedExecutionTarget managedTarget = new ManagedExecutionTarget(address(orgExecutor));
        vm.prank(orgAdmin);
        isoProposals.setExecutionTargetRule(orgId, address(managedTarget), true, 0);
        vm.prank(orgAdmin);
        isoProposals.setExecutionSelectorRule(orgId, address(managedTarget), ManagedExecutionTarget.setNumber.selector, true);
        bytes memory actionData = abi.encodeCall(ManagedExecutionTarget.setNumber, (orgId, uint256(77)));
        vm.prank(proposer);
        uint64 proposalId = isoProposals.createProposal(
            orgId,
            IsoTypes.ProposalType.Standard,
            address(managedTarget),
            0,
            ManagedExecutionTarget.setNumber.selector,
            keccak256(actionData),
            "ipfs://managed-proposal"
        );
        vm.prank(approver);
        isoProposals.approveProposal(orgId, proposalId, bodyId);
        vm.recordLogs();
        vm.prank(executor);
        isoProposals.executeProposal(orgId, proposalId, actionData);
        Vm.Log[] memory entries = vm.getRecordedLogs();
        _assertManagedCallExecutedLog(
            entries,
            address(orgExecutor),
            orgId,
            proposalId,
            address(managedTarget),
            address(orgExecutor),
            0,
            ManagedExecutionTarget.setNumber.selector,
            keccak256(actionData)
        );
        _assertProposalExecutedLog(
            entries,
            address(isoProposals),
            orgId,
            proposalId,
            executor,
            address(managedTarget),
            0,
            ManagedExecutionTarget.setNumber.selector,
            keccak256(actionData),
            address(orgExecutor)
        );
        assertEq(managedTarget.lastCaller(), address(orgExecutor));
        assertEq(managedTarget.number(), 77);
        assertEq(managedTarget.lastOrgId(), orgId);
        assertEq(managedTarget.lastActionHash(), keccak256(actionData));
    }

    function test_DirectExecutionFailureDoesNotEmitProposalExecuted() public {
        ManagedExecutionTarget failingTarget = new ManagedExecutionTarget(address(0xBADD));
        vm.prank(orgAdmin);
        isoProposals.setExecutionTargetRule(orgId, address(failingTarget), true, 0);
        vm.prank(orgAdmin);
        isoProposals.setExecutionSelectorRule(orgId, address(failingTarget), ManagedExecutionTarget.setNumber.selector, true);
        bytes memory actionData = abi.encodeCall(ManagedExecutionTarget.setNumber, (orgId, uint256(88)));
        vm.prank(proposer);
        uint64 proposalId = isoProposals.createProposal(
            orgId,
            IsoTypes.ProposalType.Standard,
            address(failingTarget),
            0,
            ManagedExecutionTarget.setNumber.selector,
            keccak256(actionData),
            "ipfs://failing-direct-proposal"
        );
        vm.prank(approver);
        isoProposals.approveProposal(orgId, proposalId, bodyId);

        vm.recordLogs();
        vm.expectRevert();
        vm.prank(executor);
        isoProposals.executeProposal(orgId, proposalId, actionData);
        Vm.Log[] memory entries = vm.getRecordedLogs();
        _assertNoEventLog(entries, address(isoProposals), PROPOSAL_EXECUTED_TOPIC);
    }

    function test_ManagedExecutionFailureDoesNotEmitSuccessfulReceipts() public {
        IsoOrgExecutor orgExecutor = new IsoOrgExecutor(address(isoProposals), orgId);
        vm.prank(orgAdmin);
        isoProposals.setOrgExecutor(orgId, address(orgExecutor));
        ManagedExecutionTarget failingTarget = new ManagedExecutionTarget(address(0xBADD));
        vm.prank(orgAdmin);
        isoProposals.setExecutionTargetRule(orgId, address(failingTarget), true, 0);
        vm.prank(orgAdmin);
        isoProposals.setExecutionSelectorRule(orgId, address(failingTarget), ManagedExecutionTarget.setNumber.selector, true);
        bytes memory actionData = abi.encodeCall(ManagedExecutionTarget.setNumber, (orgId, uint256(89)));
        vm.prank(proposer);
        uint64 proposalId = isoProposals.createProposal(
            orgId,
            IsoTypes.ProposalType.Standard,
            address(failingTarget),
            0,
            ManagedExecutionTarget.setNumber.selector,
            keccak256(actionData),
            "ipfs://failing-managed-proposal"
        );
        vm.prank(approver);
        isoProposals.approveProposal(orgId, proposalId, bodyId);

        vm.recordLogs();
        vm.expectRevert();
        vm.prank(executor);
        isoProposals.executeProposal(orgId, proposalId, actionData);
        Vm.Log[] memory entries = vm.getRecordedLogs();
        _assertNoEventLog(entries, address(isoProposals), PROPOSAL_EXECUTED_TOPIC);
        _assertNoEventLog(entries, address(orgExecutor), MANAGED_CALL_EXECUTED_TOPIC);
    }

    function testFuzz_RevokedMandateNeverAuthorizes(uint8 proposalTypeSeed) public {
        IsoTypes.ProposalType proposalType = _proposalTypeFromSeed(proposalTypeSeed);
        uint64 mandateRoleId = _createRole(orgId, bodyId, IsoTypes.RoleType.Approver, "ipfs://temp-role");
        uint64 mandateId = _assignMandate(orgId, mandateRoleId, revokedHolder, _mask(proposalType));
        assertTrue(isoCore.canActOnProposalType(orgId, revokedHolder, bodyId, IsoTypes.RoleType.Approver, proposalType));
        vm.prank(orgAdmin);
        isoCore.revokeMandate(orgId, mandateId);
        assertFalse(isoCore.canActOnProposalType(orgId, revokedHolder, bodyId, IsoTypes.RoleType.Approver, proposalType));
    }

    function testFuzz_ExpiredMandateCannotAuthorize(uint32 duration) public {
        uint64 boundedDuration = uint64(bound(uint256(duration), 1, 30 days));
        uint64 roleId = _createRole(orgId, bodyId, IsoTypes.RoleType.Vetoer, "ipfs://veto-role");
        _assignTimedMandate(orgId, roleId, expiringHolder, uint64(block.timestamp), uint64(block.timestamp) + boundedDuration, _mask(IsoTypes.ProposalType.Standard));
        vm.warp(block.timestamp + boundedDuration + 1);
        assertFalse(isoCore.canActOnProposalType(orgId, expiringHolder, bodyId, IsoTypes.RoleType.Vetoer, IsoTypes.ProposalType.Standard));
    }

    function testFuzz_DataHashMismatchPreventsExecution(uint256 expectedNumber, uint256 actualNumber) public {
        vm.assume(expectedNumber != actualNumber);
        uint64 proposalId = _createStandardProposal(expectedNumber);
        vm.prank(approver);
        isoProposals.approveProposal(orgId, proposalId, bodyId);
        vm.expectRevert(abi.encodeWithSelector(DataHashMismatch.selector, keccak256(_numberAction(expectedNumber)), keccak256(_numberAction(actualNumber))));
        vm.prank(executor);
        isoProposals.executeProposal(orgId, proposalId, _numberAction(actualNumber));
    }

    function testFuzz_ProposalCannotExecuteTwice(uint256 newNumber) public {
        uint64 proposalId = _createStandardProposal(newNumber);
        bytes memory actionData = _approveAndExecute(proposalId, newNumber);
        assertEq(demoTarget.lastActionHash(), keccak256(actionData));
        vm.expectRevert(abi.encodeWithSelector(InvalidProposalStatus.selector, IsoTypes.ProposalStatus.Executed));
        vm.prank(executor);
        isoProposals.executeProposal(orgId, proposalId, actionData);
    }

    function test_RevertsWhen_ForeignBodyUsedInPolicy() public {
        vm.expectRevert(abi.encodeWithSelector(BodyDoesNotBelongToOrg.selector, orgId, foreignBodyId));
        vm.prank(orgAdmin);
        isoCore.setPolicyRule(orgId, IsoTypes.ProposalType.Treasury, _singleBodyArray(foreignBodyId), _emptyBodyArray(), bodyId, 1 hours, true);
    }

    function _approveAndExecute(uint64 proposalId, uint256 newNumber) internal returns (bytes memory actionData) {
        vm.prank(approver);
        isoProposals.approveProposal(orgId, proposalId, bodyId);
        actionData = _numberAction(newNumber);
        vm.prank(executor);
        isoProposals.executeProposal(orgId, proposalId, actionData);
    }

    function _createStandardProposal(uint256 newNumber) internal returns (uint64 proposalId) {
        bytes memory actionData = _numberAction(newNumber);
        vm.prank(proposer);
        proposalId = isoProposals.createProposal(
            orgId,
            IsoTypes.ProposalType.Standard,
            address(demoTarget),
            0,
            DemoTarget.setNumber.selector,
            keccak256(actionData),
            "ipfs://proposal"
        );
    }

    function _configureRole(uint64 targetOrgId, uint64 targetBodyId, IsoTypes.RoleType roleType, address holder) internal {
        uint64 roleId = _createRole(targetOrgId, targetBodyId, roleType, "ipfs://role");
        _assignMandate(targetOrgId, roleId, holder, _mask(IsoTypes.ProposalType.Standard));
    }

    function _createRole(uint64 targetOrgId, uint64 targetBodyId, IsoTypes.RoleType roleType, string memory metadataUri) internal returns (uint64 roleId) {
        vm.prank(orgAdmin);
        roleId = isoCore.createRole(targetOrgId, targetBodyId, roleType, metadataUri);
    }

    function _assignMandate(uint64 targetOrgId, uint64 roleId, address holder, uint256 proposalTypeMask) internal returns (uint64 mandateId) {
        vm.prank(orgAdmin);
        mandateId = isoCore.assignMandate(targetOrgId, roleId, holder, uint64(block.timestamp), 0, proposalTypeMask, 0);
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
        mandateId = isoCore.assignMandate(targetOrgId, roleId, holder, startTime, endTime, proposalTypeMask, 0);
    }

    function _numberAction(uint256 newNumber) internal view returns (bytes memory actionData) {
        actionData = abi.encodeCall(DemoTarget.setNumber, (orgId, newNumber));
    }

    function _assertProposalExecutedLog(
        Vm.Log[] memory entries,
        address expectedEmitter,
        uint64 expectedOrgId,
        uint64 expectedProposalId,
        address expectedExecutor,
        address expectedTarget,
        uint256 expectedValue,
        bytes4 expectedActionSelector,
        bytes32 expectedDataHash,
        address expectedManagedExecutor
    ) internal pure {
        bool found;
        for (uint256 index = 0; index < entries.length; index++) {
            if (!_isLog(entries[index], expectedEmitter, PROPOSAL_EXECUTED_TOPIC)) {
                continue;
            }
            found = true;
            assertEq(entries[index].topics[1], _topicUint64(expectedOrgId));
            assertEq(entries[index].topics[2], _topicUint64(expectedProposalId));
            assertEq(entries[index].topics[3], _topicAddress(expectedExecutor));
            (address target, uint256 value, bytes4 actionSelector, bytes32 dataHash, address managedExecutor) =
                abi.decode(entries[index].data, (address, uint256, bytes4, bytes32, address));
            assertEq(target, expectedTarget);
            assertEq(value, expectedValue);
            assertTrue(actionSelector == expectedActionSelector);
            assertEq(dataHash, expectedDataHash);
            assertEq(managedExecutor, expectedManagedExecutor);
        }
        assertTrue(found, "missing ProposalExecuted log");
    }

    function _assertManagedCallExecutedLog(
        Vm.Log[] memory entries,
        address expectedEmitter,
        uint64 expectedOrgId,
        uint64 expectedProposalId,
        address expectedTarget,
        address expectedExecutor,
        uint256 expectedValue,
        bytes4 expectedActionSelector,
        bytes32 expectedDataHash
    ) internal pure {
        bool found;
        for (uint256 index = 0; index < entries.length; index++) {
            if (!_isLog(entries[index], expectedEmitter, MANAGED_CALL_EXECUTED_TOPIC)) {
                continue;
            }
            found = true;
            assertEq(entries[index].topics[1], _topicUint64(expectedOrgId));
            assertEq(entries[index].topics[2], _topicUint64(expectedProposalId));
            assertEq(entries[index].topics[3], _topicAddress(expectedTarget));
            (address executorAddress, uint256 value, bytes4 actionSelector, bytes32 dataHash) =
                abi.decode(entries[index].data, (address, uint256, bytes4, bytes32));
            assertEq(executorAddress, expectedExecutor);
            assertEq(value, expectedValue);
            assertTrue(actionSelector == expectedActionSelector);
            assertEq(dataHash, expectedDataHash);
        }
        assertTrue(found, "missing ManagedCallExecuted log");
    }

    function _assertNoEventLog(Vm.Log[] memory entries, address expectedEmitter, bytes32 expectedTopic) internal pure {
        for (uint256 index = 0; index < entries.length; index++) {
            assertFalse(_isLog(entries[index], expectedEmitter, expectedTopic), "unexpected execution receipt log");
        }
    }

    function _isLog(Vm.Log memory entry, address expectedEmitter, bytes32 expectedTopic) internal pure returns (bool) {
        return entry.emitter == expectedEmitter && entry.topics.length > 0 && entry.topics[0] == expectedTopic;
    }

    function _topicUint64(uint64 value) internal pure returns (bytes32 topic) {
        topic = bytes32(uint256(value));
    }

    function _topicAddress(address value) internal pure returns (bytes32 topic) {
        topic = bytes32(uint256(uint160(value)));
    }

    function _singleBodyArray(uint64 targetBodyId) internal pure returns (uint64[] memory bodyIds) {
        bodyIds = new uint64[](1);
        bodyIds[0] = targetBodyId;
    }

    function _emptyBodyArray() internal pure returns (uint64[] memory bodyIds) {
        bodyIds = new uint64[](0);
    }

    function _mask(IsoTypes.ProposalType proposalType) internal pure returns (uint256 proposalTypeMask) {
        proposalTypeMask = uint256(1) << uint8(proposalType);
    }

    function _proposalTypeFromSeed(uint8 proposalTypeSeed) internal pure returns (IsoTypes.ProposalType proposalType) {
        uint8 proposalTypeValue = uint8(bound(uint256(proposalTypeSeed), 1, 4));
        proposalType = IsoTypes.ProposalType(proposalTypeValue);
    }
}
