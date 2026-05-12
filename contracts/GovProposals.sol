// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GovTypes} from "./GovTypes.sol";
import {IGovCore} from "./interfaces/IGovCore.sol";
import {
    ZeroAddress,
    Unauthorized,
    InvalidProposalType,
    PolicyRuleNotEnabled,
    ProposalNotFound,
    ProposalDoesNotBelongToOrg,
    InvalidProposalStatus,
    BodyNotRequiredApprover,
    BodyNotVetoer,
    AlreadyApproved,
    AlreadyVetoed,
    MissingRequiredApprovals,
    TimelockNotExpired,
    DataHashMismatch,
    TargetNotAllowed,
    InvalidExecutionValue,
    ExecutionFailed
} from "./GovErrors.sol";

contract GovProposals {
    IGovCore public immutable govCore;
    address public immutable demoTarget;
    uint64 public nextProposalId = 1;

    mapping(uint64 => GovTypes.Proposal) public proposals;
    mapping(uint64 => mapping(uint64 => bool)) public proposalApprovals;
    mapping(uint64 => mapping(uint64 => bool)) public proposalVetoes;
    mapping(uint64 => mapping(uint64 => address)) public proposalDecisionActor;

    event ProposalCreated(
        uint64 indexed orgId,
        uint64 indexed proposalId,
        GovTypes.ProposalType indexed proposalType,
        uint64 policyVersion,
        address creator,
        address target,
        uint256 value,
        bytes32 dataHash,
        string metadataURI
    );
    event ProposalApproved(uint64 indexed orgId, uint64 indexed proposalId, uint64 indexed bodyId, address actor);
    event ProposalVetoed(uint64 indexed orgId, uint64 indexed proposalId, uint64 indexed bodyId, address actor);
    event ProposalQueued(uint64 indexed orgId, uint64 indexed proposalId, uint64 queuedAt, uint64 executableAt);
    event ProposalExecuted(uint64 indexed orgId, uint64 indexed proposalId, address indexed executor, address target, bytes32 dataHash);
    event ProposalCancelled(uint64 indexed orgId, uint64 indexed proposalId, address indexed actor);
    event ProposalStatusChanged(
        uint64 indexed orgId,
        uint64 indexed proposalId,
        GovTypes.ProposalStatus previousStatus,
        GovTypes.ProposalStatus newStatus
    );

    constructor(address govCoreAddress, address demoTargetAddress) {
        if (govCoreAddress == address(0) || demoTargetAddress == address(0)) {
            revert ZeroAddress();
        }
        govCore = IGovCore(govCoreAddress);
        demoTarget = demoTargetAddress;
    }

    function createProposal(
        uint64 orgId,
        GovTypes.ProposalType proposalType,
        address target,
        uint256 value,
        bytes32 dataHash,
        string calldata metadataURI
    ) external returns (uint64 proposalId) {
        GovTypes.PolicyRule memory rule = _requireEnabledPolicy(orgId, proposalType);
        GovTypes.ProposalStatus initialStatus = rule.requiredApprovalBodies.length == 0
            ? GovTypes.ProposalStatus.Approved
            : GovTypes.ProposalStatus.UnderReview;
        if (!govCore.isOrganizationAdmin(orgId, msg.sender) && !govCore.hasRole(orgId, msg.sender, GovTypes.RoleType.Proposer, proposalType)) {
            revert Unauthorized(msg.sender);
        }
        proposalId = nextProposalId;
        nextProposalId = proposalId + 1;
        proposals[proposalId] = GovTypes.Proposal({
            id: proposalId,
            orgId: orgId,
            proposalType: proposalType,
            policyVersion: rule.version,
            status: initialStatus,
            creator: msg.sender,
            target: target,
            value: value,
            dataHash: dataHash,
            createdAt: _currentTimestamp(),
            queuedAt: 0,
            executableAt: 0,
            executedAt: 0,
            metadataURI: metadataURI
        });
        emit ProposalCreated(orgId, proposalId, proposalType, rule.version, msg.sender, target, value, dataHash, metadataURI);
    }

    function approveProposal(uint64 orgId, uint64 proposalId, uint64 bodyId) external {
        GovTypes.Proposal storage proposal = _requireMutableProposal(orgId, proposalId);
        GovTypes.PolicyRule memory rule = _requireEnabledProposalPolicy(proposal);
        if (!_containsBody(rule.requiredApprovalBodies, bodyId)) {
            revert BodyNotRequiredApprover(bodyId);
        }
        if (!govCore.canActOnProposalType(orgId, msg.sender, bodyId, GovTypes.RoleType.Approver, proposal.proposalType)) {
            revert Unauthorized(msg.sender);
        }
        if (proposalApprovals[proposalId][bodyId]) {
            revert AlreadyApproved(proposalId, bodyId);
        }
        proposalApprovals[proposalId][bodyId] = true;
        proposalDecisionActor[proposalId][bodyId] = msg.sender;
        if (_allApprovalsCollected(proposalId, rule.requiredApprovalBodies)) {
            _setProposalStatus(proposal, GovTypes.ProposalStatus.Approved);
        }
        emit ProposalApproved(orgId, proposalId, bodyId, msg.sender);
    }

    function vetoProposal(uint64 orgId, uint64 proposalId, uint64 bodyId) external {
        GovTypes.Proposal storage proposal = _requireProposalInOrg(orgId, proposalId);
        GovTypes.PolicyRule memory rule = _requireEnabledProposalPolicy(proposal);
        if (!_isVetoableStatus(proposal.status)) {
            revert InvalidProposalStatus(proposal.status);
        }
        if (!_containsBody(rule.vetoBodies, bodyId)) {
            revert BodyNotVetoer(bodyId);
        }
        if (!govCore.canActOnProposalType(orgId, msg.sender, bodyId, GovTypes.RoleType.Vetoer, proposal.proposalType)) {
            revert Unauthorized(msg.sender);
        }
        if (proposalVetoes[proposalId][bodyId]) {
            revert AlreadyVetoed(proposalId, bodyId);
        }
        proposalVetoes[proposalId][bodyId] = true;
        proposalDecisionActor[proposalId][bodyId] = msg.sender;
        _setProposalStatus(proposal, GovTypes.ProposalStatus.Vetoed);
        emit ProposalVetoed(orgId, proposalId, bodyId, msg.sender);
    }

    function queueProposal(uint64 orgId, uint64 proposalId) external {
        GovTypes.Proposal storage proposal = _requireProposalInOrg(orgId, proposalId);
        GovTypes.PolicyRule memory rule = _requireEnabledProposalPolicy(proposal);
        if (proposal.status != GovTypes.ProposalStatus.Approved) {
            revert InvalidProposalStatus(proposal.status);
        }
        _setProposalStatus(proposal, GovTypes.ProposalStatus.Queued);
        proposal.queuedAt = _currentTimestamp();
        proposal.executableAt = proposal.queuedAt + rule.timelockSeconds;
        emit ProposalQueued(orgId, proposalId, proposal.queuedAt, proposal.executableAt);
    }

    function executeProposal(uint64 orgId, uint64 proposalId, bytes calldata actionData) external payable {
        GovTypes.Proposal storage proposal = _requireProposalInOrg(orgId, proposalId);
        GovTypes.PolicyRule memory rule = _requireEnabledProposalPolicy(proposal);
        _requireExecutableState(proposal, rule, proposalId);
        if (!govCore.canActOnProposalType(orgId, msg.sender, rule.executorBody, GovTypes.RoleType.Executor, proposal.proposalType)) {
            revert Unauthorized(msg.sender);
        }
        if (proposal.target != demoTarget) {
            revert TargetNotAllowed(proposal.target);
        }
        if (keccak256(actionData) != proposal.dataHash) {
            revert DataHashMismatch(proposal.dataHash, keccak256(actionData));
        }
        if (msg.value != proposal.value) {
            revert InvalidExecutionValue(proposal.value, msg.value);
        }
        _setProposalStatus(proposal, GovTypes.ProposalStatus.Executed);
        proposal.executedAt = _currentTimestamp();
        (bool success, bytes memory result) = proposal.target.call{value: msg.value}(actionData);
        if (!success) {
            revert ExecutionFailed(result);
        }
        emit ProposalExecuted(orgId, proposalId, msg.sender, proposal.target, proposal.dataHash);
    }

    function cancelProposal(uint64 orgId, uint64 proposalId) external {
        GovTypes.Proposal storage proposal = _requireProposalInOrg(orgId, proposalId);
        GovTypes.PolicyRule memory rule = _requireEnabledProposalPolicy(proposal);
        if (!_isCancellableStatus(proposal.status)) {
            revert InvalidProposalStatus(proposal.status);
        }
        if (govCore.isOrganizationAdmin(orgId, msg.sender) && !govCore.isOrganizationFinalized(orgId)) {
            _setProposalStatus(proposal, GovTypes.ProposalStatus.Cancelled);
            emit ProposalCancelled(orgId, proposalId, msg.sender);
            return;
        }
        if (proposal.creator != msg.sender || _hasAnyApproval(proposalId, rule.requiredApprovalBodies)) {
            revert Unauthorized(msg.sender);
        }
        _setProposalStatus(proposal, GovTypes.ProposalStatus.Cancelled);
        emit ProposalCancelled(orgId, proposalId, msg.sender);
    }

    function _requireEnabledPolicy(uint64 orgId, GovTypes.ProposalType proposalType) internal view returns (GovTypes.PolicyRule memory rule) {
        if (!govCore.isOrganizationActive(orgId)) {
            revert PolicyRuleNotEnabled(orgId, proposalType);
        }
        if (proposalType == GovTypes.ProposalType.Unknown) {
            revert InvalidProposalType();
        }
        rule = govCore.getPolicyRule(orgId, proposalType);
        if (!rule.enabled) {
            revert PolicyRuleNotEnabled(orgId, proposalType);
        }
    }

    function _requireEnabledProposalPolicy(GovTypes.Proposal storage proposal) internal view returns (GovTypes.PolicyRule memory rule) {
        if (!govCore.isOrganizationActive(proposal.orgId)) {
            revert PolicyRuleNotEnabled(proposal.orgId, proposal.proposalType);
        }
        rule = govCore.getPolicyRuleAtVersion(proposal.orgId, proposal.proposalType, proposal.policyVersion);
        if (!rule.enabled) {
            revert PolicyRuleNotEnabled(proposal.orgId, proposal.proposalType);
        }
    }

    function _requireProposalInOrg(uint64 orgId, uint64 proposalId) internal view returns (GovTypes.Proposal storage proposal) {
        proposal = proposals[proposalId];
        if (proposal.id == 0) {
            revert ProposalNotFound(proposalId);
        }
        if (proposal.orgId != orgId) {
            revert ProposalDoesNotBelongToOrg(orgId, proposalId);
        }
    }

    function _requireMutableProposal(uint64 orgId, uint64 proposalId) internal view returns (GovTypes.Proposal storage proposal) {
        proposal = _requireProposalInOrg(orgId, proposalId);
        if (proposal.status != GovTypes.ProposalStatus.Created && proposal.status != GovTypes.ProposalStatus.UnderReview) {
            revert InvalidProposalStatus(proposal.status);
        }
    }

    function _setProposalStatus(GovTypes.Proposal storage proposal, GovTypes.ProposalStatus nextStatus) internal {
        GovTypes.ProposalStatus previousStatus = proposal.status;
        if (previousStatus == nextStatus) {
            return;
        }
        proposal.status = nextStatus;
        emit ProposalStatusChanged(proposal.orgId, proposal.id, previousStatus, nextStatus);
    }

    function _requireExecutableState(
        GovTypes.Proposal storage proposal,
        GovTypes.PolicyRule memory rule,
        uint64 proposalId
    ) internal view {
        if (!_isExecutableStatus(proposal.status)) {
            revert InvalidProposalStatus(proposal.status);
        }
        if (!_allApprovalsCollected(proposalId, rule.requiredApprovalBodies)) {
            revert MissingRequiredApprovals(proposalId);
        }
        if (_hasAnyVeto(proposalId, rule.vetoBodies)) {
            revert InvalidProposalStatus(GovTypes.ProposalStatus.Vetoed);
        }
        if (rule.timelockSeconds != 0) {
            if (proposal.status != GovTypes.ProposalStatus.Queued) {
                revert InvalidProposalStatus(proposal.status);
            }
            if (_currentTimestamp() < proposal.executableAt) {
                revert TimelockNotExpired(proposalId, proposal.executableAt);
            }
        }
    }

    function _allApprovalsCollected(uint64 proposalId, uint64[] memory requiredBodies) internal view returns (bool isComplete) {
        uint256 bodyCount = requiredBodies.length;
        for (uint256 index = 0; index < bodyCount; index++) {
            if (!proposalApprovals[proposalId][requiredBodies[index]]) {
                return false;
            }
        }
        isComplete = true;
    }

    function _hasAnyApproval(uint64 proposalId, uint64[] memory requiredBodies) internal view returns (bool hasApproval) {
        uint256 bodyCount = requiredBodies.length;
        for (uint256 index = 0; index < bodyCount; index++) {
            if (proposalApprovals[proposalId][requiredBodies[index]]) {
                return true;
            }
        }
        hasApproval = false;
    }

    function _hasAnyVeto(uint64 proposalId, uint64[] memory vetoBodies) internal view returns (bool hasVeto) {
        uint256 bodyCount = vetoBodies.length;
        for (uint256 index = 0; index < bodyCount; index++) {
            if (proposalVetoes[proposalId][vetoBodies[index]]) {
                return true;
            }
        }
        hasVeto = false;
    }

    function _containsBody(uint64[] memory bodyIds, uint64 bodyId) internal pure returns (bool contains) {
        uint256 bodyCount = bodyIds.length;
        for (uint256 index = 0; index < bodyCount; index++) {
            if (bodyIds[index] == bodyId) {
                return true;
            }
        }
        contains = false;
    }

    function _isVetoableStatus(GovTypes.ProposalStatus status) internal pure returns (bool isAllowed) {
        isAllowed = status != GovTypes.ProposalStatus.Executed
            && status != GovTypes.ProposalStatus.Cancelled
            && status != GovTypes.ProposalStatus.Vetoed
            && status != GovTypes.ProposalStatus.Expired;
    }

    function _isExecutableStatus(GovTypes.ProposalStatus status) internal pure returns (bool isAllowed) {
        isAllowed = status == GovTypes.ProposalStatus.Approved || status == GovTypes.ProposalStatus.Queued;
    }

    function _isCancellableStatus(GovTypes.ProposalStatus status) internal pure returns (bool isAllowed) {
        isAllowed = status != GovTypes.ProposalStatus.Executed
            && status != GovTypes.ProposalStatus.Cancelled
            && status != GovTypes.ProposalStatus.Vetoed
            && status != GovTypes.ProposalStatus.Expired;
    }

    function _currentTimestamp() internal view returns (uint64 timestamp) {
        timestamp = uint64(block.timestamp);
    }
}
