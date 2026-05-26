// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IsoTypes} from "./IsoTypes.sol";
import {IIsoCore} from "./interfaces/IIsoCore.sol";
import {IIsoOrgExecutor} from "./interfaces/IIsoOrgExecutor.sol";
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
    OrganizationNotActive,
    OrganizationAlreadyFinalized,
    ExecutionTargetNotAllowed,
    ExecutionSelectorNotAllowed,
    ActionSelectorMismatch,
    InvalidExecutionCalldata,
    ExecutionValueLimitExceeded,
    InvalidOrgExecutor,
    OrgExecutorOrgMismatch,
    InvalidExecutionValue,
    ExecutionFailed
} from "./IsoErrors.sol";

contract IsoProposals {
    IIsoCore public immutable isoCore;
    uint64 public nextProposalId = 1;

    mapping(uint64 => mapping(address => IsoTypes.ExecutionTargetRule)) public executionTargetRules;
    mapping(uint64 => mapping(address => mapping(bytes4 => bool))) public executionSelectorRules;
    mapping(uint64 => address) public orgExecutors;
    mapping(uint64 => IsoTypes.Proposal) public proposals;
    mapping(uint64 => mapping(uint64 => bool)) public proposalApprovals;
    mapping(uint64 => mapping(uint64 => bool)) public proposalVetoes;
    mapping(uint64 => mapping(uint64 => address)) public proposalDecisionActor;

    event ExecutionTargetRuleUpdated(uint64 indexed orgId, address indexed target, bool enabled, uint256 maxValue, address indexed actor);
    event ExecutionSelectorRuleUpdated(uint64 indexed orgId, address indexed target, bytes4 selector, bool enabled, address actor);
    event OrgExecutorUpdated(uint64 indexed orgId, address previousExecutor, address newExecutor, address actor);
    event ProposalCreated(
        uint64 indexed orgId,
        uint64 indexed proposalId,
        IsoTypes.ProposalType indexed proposalType,
        uint64 policyVersion,
        address creator,
        address target,
        uint256 value,
        bytes4 actionSelector,
        bytes32 dataHash,
        string metadataURI
    );
    event ProposalApproved(uint64 indexed orgId, uint64 indexed proposalId, uint64 indexed bodyId, address actor);
    event ProposalVetoed(uint64 indexed orgId, uint64 indexed proposalId, uint64 indexed bodyId, address actor);
    event ProposalQueued(uint64 indexed orgId, uint64 indexed proposalId, uint64 queuedAt, uint64 executableAt);
    event ProposalExecuted(
        uint64 indexed orgId,
        uint64 indexed proposalId,
        address indexed executor,
        address target,
        uint256 value,
        bytes4 actionSelector,
        bytes32 dataHash,
        address managedExecutor
    );
    event ProposalCancelled(uint64 indexed orgId, uint64 indexed proposalId, address indexed actor);
    event ProposalStatusChanged(
        uint64 indexed orgId,
        uint64 indexed proposalId,
        IsoTypes.ProposalStatus previousStatus,
        IsoTypes.ProposalStatus newStatus
    );

    constructor(address isoCoreAddress) {
        if (isoCoreAddress == address(0)) {
            revert ZeroAddress();
        }
        isoCore = IIsoCore(isoCoreAddress);
    }

    function setExecutionTargetRule(
        uint64 orgId,
        address target,
        bool enabled,
        uint256 maxValue
    ) external {
        _requireBootstrapOrgAdmin(orgId);
        if (target == address(0)) {
            revert ZeroAddress();
        }
        executionTargetRules[orgId][target] = IsoTypes.ExecutionTargetRule({enabled: enabled, maxValue: maxValue});
        emit ExecutionTargetRuleUpdated(orgId, target, enabled, maxValue, msg.sender);
    }

    function setExecutionSelectorRule(
        uint64 orgId,
        address target,
        bytes4 selector,
        bool enabled
    ) external {
        _requireBootstrapOrgAdmin(orgId);
        if (target == address(0)) {
            revert ZeroAddress();
        }
        executionSelectorRules[orgId][target][selector] = enabled;
        emit ExecutionSelectorRuleUpdated(orgId, target, selector, enabled, msg.sender);
    }

    function setOrgExecutor(uint64 orgId, address newExecutor) external {
        _requireBootstrapOrgAdmin(orgId);
        if (newExecutor != address(0)) {
            _requireCompatibleOrgExecutor(orgId, newExecutor);
        }
        address previousExecutor = orgExecutors[orgId];
        orgExecutors[orgId] = newExecutor;
        emit OrgExecutorUpdated(orgId, previousExecutor, newExecutor, msg.sender);
    }

    function getOrgExecutor(uint64 orgId) external view returns (address executor) {
        executor = orgExecutors[orgId];
    }

    function isExecutionTargetAllowed(uint64 orgId, address target) external view returns (bool isAllowed) {
        isAllowed = executionTargetRules[orgId][target].enabled;
    }

    function isExecutionSelectorAllowed(uint64 orgId, address target, bytes4 selector) external view returns (bool isAllowed) {
        isAllowed = executionSelectorRules[orgId][target][selector];
    }

    function createProposal(
        uint64 orgId,
        IsoTypes.ProposalType proposalType,
        address target,
        uint256 value,
        bytes4 actionSelector,
        bytes32 dataHash,
        string calldata metadataURI
    ) external returns (uint64 proposalId) {
        IsoTypes.PolicyRule memory rule = _requireEnabledPolicy(orgId, proposalType);
        IsoTypes.ProposalStatus initialStatus = rule.requiredApprovalBodies.length == 0
            ? IsoTypes.ProposalStatus.Approved
            : IsoTypes.ProposalStatus.UnderReview;
        if (!isoCore.isOrganizationAdmin(orgId, msg.sender) && !isoCore.hasRole(orgId, msg.sender, IsoTypes.RoleType.Proposer, proposalType)) {
            revert Unauthorized(msg.sender);
        }
        proposalId = nextProposalId;
        nextProposalId = proposalId + 1;
        proposals[proposalId] = IsoTypes.Proposal({
            id: proposalId,
            orgId: orgId,
            proposalType: proposalType,
            policyVersion: rule.version,
            status: initialStatus,
            creator: msg.sender,
            target: target,
            value: value,
            actionSelector: actionSelector,
            dataHash: dataHash,
            createdAt: _currentTimestamp(),
            queuedAt: 0,
            executableAt: 0,
            executedAt: 0,
            metadataURI: metadataURI
        });
        emit ProposalCreated(orgId, proposalId, proposalType, rule.version, msg.sender, target, value, actionSelector, dataHash, metadataURI);
    }

    function approveProposal(uint64 orgId, uint64 proposalId, uint64 bodyId) external {
        IsoTypes.Proposal storage proposal = _requireMutableProposal(orgId, proposalId);
        IsoTypes.PolicyRule memory rule = _requireEnabledProposalPolicy(proposal);
        if (!_containsBody(rule.requiredApprovalBodies, bodyId)) {
            revert BodyNotRequiredApprover(bodyId);
        }
        if (!isoCore.canActOnProposalType(orgId, msg.sender, bodyId, IsoTypes.RoleType.Approver, proposal.proposalType)) {
            revert Unauthorized(msg.sender);
        }
        if (proposalApprovals[proposalId][bodyId]) {
            revert AlreadyApproved(proposalId, bodyId);
        }
        proposalApprovals[proposalId][bodyId] = true;
        proposalDecisionActor[proposalId][bodyId] = msg.sender;
        if (_allApprovalsCollected(proposalId, rule.requiredApprovalBodies)) {
            _setProposalStatus(proposal, IsoTypes.ProposalStatus.Approved);
        }
        emit ProposalApproved(orgId, proposalId, bodyId, msg.sender);
    }

    function vetoProposal(uint64 orgId, uint64 proposalId, uint64 bodyId) external {
        IsoTypes.Proposal storage proposal = _requireProposalInOrg(orgId, proposalId);
        IsoTypes.PolicyRule memory rule = _requireEnabledProposalPolicy(proposal);
        if (!_isVetoableStatus(proposal.status)) {
            revert InvalidProposalStatus(proposal.status);
        }
        if (!_containsBody(rule.vetoBodies, bodyId)) {
            revert BodyNotVetoer(bodyId);
        }
        if (!isoCore.canActOnProposalType(orgId, msg.sender, bodyId, IsoTypes.RoleType.Vetoer, proposal.proposalType)) {
            revert Unauthorized(msg.sender);
        }
        if (proposalVetoes[proposalId][bodyId]) {
            revert AlreadyVetoed(proposalId, bodyId);
        }
        proposalVetoes[proposalId][bodyId] = true;
        proposalDecisionActor[proposalId][bodyId] = msg.sender;
        _setProposalStatus(proposal, IsoTypes.ProposalStatus.Vetoed);
        emit ProposalVetoed(orgId, proposalId, bodyId, msg.sender);
    }

    function queueProposal(uint64 orgId, uint64 proposalId) external {
        IsoTypes.Proposal storage proposal = _requireProposalInOrg(orgId, proposalId);
        IsoTypes.PolicyRule memory rule = _requireEnabledProposalPolicy(proposal);
        if (proposal.status != IsoTypes.ProposalStatus.Approved) {
            revert InvalidProposalStatus(proposal.status);
        }
        _setProposalStatus(proposal, IsoTypes.ProposalStatus.Queued);
        proposal.queuedAt = _currentTimestamp();
        proposal.executableAt = proposal.queuedAt + rule.timelockSeconds;
        emit ProposalQueued(orgId, proposalId, proposal.queuedAt, proposal.executableAt);
    }

    function executeProposal(uint64 orgId, uint64 proposalId, bytes calldata actionData) external payable {
        IsoTypes.Proposal storage proposal = _requireProposalInOrg(orgId, proposalId);
        IsoTypes.PolicyRule memory rule = _requireEnabledProposalPolicy(proposal);
        _requireExecutableState(proposal, rule, proposalId);
        if (!isoCore.canActOnProposalType(orgId, msg.sender, rule.executorBody, IsoTypes.RoleType.Executor, proposal.proposalType)) {
            revert Unauthorized(msg.sender);
        }
        if (proposal.target == address(0)) {
            revert ZeroAddress();
        }
        bytes4 actualSelector = _executionSelector(actionData);
        if (actualSelector != proposal.actionSelector) {
            revert ActionSelectorMismatch(proposal.actionSelector, actualSelector);
        }
        IsoTypes.ExecutionTargetRule memory executionRule = _requireExecutionPermission(proposal.orgId, proposal.target, proposal.actionSelector);
        if (proposal.value > executionRule.maxValue) {
            revert ExecutionValueLimitExceeded(proposal.orgId, proposal.target, executionRule.maxValue, proposal.value);
        }
        if (msg.value > executionRule.maxValue) {
            revert ExecutionValueLimitExceeded(proposal.orgId, proposal.target, executionRule.maxValue, msg.value);
        }
        bytes32 actualDataHash = keccak256(actionData);
        if (actualDataHash != proposal.dataHash) {
            revert DataHashMismatch(proposal.dataHash, actualDataHash);
        }
        if (msg.value != proposal.value) {
            revert InvalidExecutionValue(proposal.value, msg.value);
        }
        _setProposalStatus(proposal, IsoTypes.ProposalStatus.Executed);
        proposal.executedAt = _currentTimestamp();
        address managedExecutor = orgExecutors[proposal.orgId];
        if (managedExecutor == address(0)) {
            (bool success, bytes memory result) = proposal.target.call{value: msg.value}(actionData);
            if (!success) {
                revert ExecutionFailed(result);
            }
        } else {
            IIsoOrgExecutor(managedExecutor).executeGovernedCall{value: msg.value}(
                proposal.orgId,
                proposalId,
                proposal.target,
                proposal.value,
                proposal.actionSelector,
                proposal.dataHash,
                actionData
            );
        }
        emit ProposalExecuted(
            orgId,
            proposalId,
            msg.sender,
            proposal.target,
            proposal.value,
            proposal.actionSelector,
            proposal.dataHash,
            managedExecutor
        );
    }

    function cancelProposal(uint64 orgId, uint64 proposalId) external {
        IsoTypes.Proposal storage proposal = _requireProposalInOrg(orgId, proposalId);
        IsoTypes.PolicyRule memory rule = _requireEnabledProposalPolicy(proposal);
        if (!_isCancellableStatus(proposal.status)) {
            revert InvalidProposalStatus(proposal.status);
        }
        if (isoCore.isOrganizationAdmin(orgId, msg.sender) && !isoCore.isOrganizationFinalized(orgId)) {
            _setProposalStatus(proposal, IsoTypes.ProposalStatus.Cancelled);
            emit ProposalCancelled(orgId, proposalId, msg.sender);
            return;
        }
        if (proposal.creator != msg.sender || _hasAnyApproval(proposalId, rule.requiredApprovalBodies)) {
            revert Unauthorized(msg.sender);
        }
        _setProposalStatus(proposal, IsoTypes.ProposalStatus.Cancelled);
        emit ProposalCancelled(orgId, proposalId, msg.sender);
    }

    function _requireCompatibleOrgExecutor(uint64 orgId, address executor) internal view {
        if (executor.code.length == 0) {
            revert InvalidOrgExecutor(executor);
        }
        try IIsoOrgExecutor(executor).orgId() returns (uint64 executorOrgId) {
            if (executorOrgId != orgId) {
                revert OrgExecutorOrgMismatch(orgId, executorOrgId);
            }
        } catch {
            revert InvalidOrgExecutor(executor);
        }
        try IIsoOrgExecutor(executor).isoProposals() returns (address executorIsoProposals) {
            if (executorIsoProposals != address(this)) {
                revert InvalidOrgExecutor(executor);
            }
        } catch {
            revert InvalidOrgExecutor(executor);
        }
    }

    function _requireBootstrapOrgAdmin(uint64 orgId) internal view {
        if (!isoCore.isOrganizationActive(orgId)) {
            revert OrganizationNotActive(orgId);
        }
        if (!isoCore.isOrganizationAdmin(orgId, msg.sender)) {
            revert Unauthorized(msg.sender);
        }
        if (isoCore.isOrganizationFinalized(orgId)) {
            revert OrganizationAlreadyFinalized(orgId);
        }
    }

    function _requireExecutionPermission(
        uint64 orgId,
        address target,
        bytes4 selector
    ) internal view returns (IsoTypes.ExecutionTargetRule memory rule) {
        if (target == address(0)) {
            revert ZeroAddress();
        }
        rule = executionTargetRules[orgId][target];
        if (!rule.enabled) {
            revert ExecutionTargetNotAllowed(orgId, target);
        }
        if (!executionSelectorRules[orgId][target][selector]) {
            revert ExecutionSelectorNotAllowed(orgId, target, selector);
        }
    }

    function _executionSelector(bytes calldata actionData) internal pure returns (bytes4 selector) {
        if (actionData.length < 4) {
            revert InvalidExecutionCalldata();
        }
        assembly {
            selector := calldataload(actionData.offset)
        }
    }

    function _requireEnabledPolicy(uint64 orgId, IsoTypes.ProposalType proposalType) internal view returns (IsoTypes.PolicyRule memory rule) {
        if (!isoCore.isOrganizationActive(orgId)) {
            revert PolicyRuleNotEnabled(orgId, proposalType);
        }
        if (proposalType == IsoTypes.ProposalType.Unknown) {
            revert InvalidProposalType();
        }
        rule = isoCore.getPolicyRule(orgId, proposalType);
        if (!rule.enabled) {
            revert PolicyRuleNotEnabled(orgId, proposalType);
        }
    }

    function _requireEnabledProposalPolicy(IsoTypes.Proposal storage proposal) internal view returns (IsoTypes.PolicyRule memory rule) {
        if (!isoCore.isOrganizationActive(proposal.orgId)) {
            revert PolicyRuleNotEnabled(proposal.orgId, proposal.proposalType);
        }
        rule = isoCore.getPolicyRuleAtVersion(proposal.orgId, proposal.proposalType, proposal.policyVersion);
        if (!rule.enabled) {
            revert PolicyRuleNotEnabled(proposal.orgId, proposal.proposalType);
        }
    }

    function _requireProposalInOrg(uint64 orgId, uint64 proposalId) internal view returns (IsoTypes.Proposal storage proposal) {
        proposal = proposals[proposalId];
        if (proposal.id == 0) {
            revert ProposalNotFound(proposalId);
        }
        if (proposal.orgId != orgId) {
            revert ProposalDoesNotBelongToOrg(orgId, proposalId);
        }
    }

    function _requireMutableProposal(uint64 orgId, uint64 proposalId) internal view returns (IsoTypes.Proposal storage proposal) {
        proposal = _requireProposalInOrg(orgId, proposalId);
        if (proposal.status != IsoTypes.ProposalStatus.Created && proposal.status != IsoTypes.ProposalStatus.UnderReview) {
            revert InvalidProposalStatus(proposal.status);
        }
    }

    function _setProposalStatus(IsoTypes.Proposal storage proposal, IsoTypes.ProposalStatus nextStatus) internal {
        IsoTypes.ProposalStatus previousStatus = proposal.status;
        if (previousStatus == nextStatus) {
            return;
        }
        proposal.status = nextStatus;
        emit ProposalStatusChanged(proposal.orgId, proposal.id, previousStatus, nextStatus);
    }

    function _requireExecutableState(
        IsoTypes.Proposal storage proposal,
        IsoTypes.PolicyRule memory rule,
        uint64 proposalId
    ) internal view {
        if (!_isExecutableStatus(proposal.status)) {
            revert InvalidProposalStatus(proposal.status);
        }
        if (!_allApprovalsCollected(proposalId, rule.requiredApprovalBodies)) {
            revert MissingRequiredApprovals(proposalId);
        }
        if (_hasAnyVeto(proposalId, rule.vetoBodies)) {
            revert InvalidProposalStatus(IsoTypes.ProposalStatus.Vetoed);
        }
        if (rule.timelockSeconds != 0) {
            if (proposal.status != IsoTypes.ProposalStatus.Queued) {
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

    function _isVetoableStatus(IsoTypes.ProposalStatus status) internal pure returns (bool isAllowed) {
        isAllowed = status != IsoTypes.ProposalStatus.Executed
            && status != IsoTypes.ProposalStatus.Cancelled
            && status != IsoTypes.ProposalStatus.Vetoed
            && status != IsoTypes.ProposalStatus.Expired;
    }

    function _isExecutableStatus(IsoTypes.ProposalStatus status) internal pure returns (bool isAllowed) {
        isAllowed = status == IsoTypes.ProposalStatus.Approved || status == IsoTypes.ProposalStatus.Queued;
    }

    function _isCancellableStatus(IsoTypes.ProposalStatus status) internal pure returns (bool isAllowed) {
        isAllowed = status != IsoTypes.ProposalStatus.Executed
            && status != IsoTypes.ProposalStatus.Cancelled
            && status != IsoTypes.ProposalStatus.Vetoed
            && status != IsoTypes.ProposalStatus.Expired;
    }

    function _currentTimestamp() internal view returns (uint64 timestamp) {
        timestamp = uint64(block.timestamp);
    }
}
