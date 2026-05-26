// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    ZeroAddress,
    Unauthorized,
    DataHashMismatch,
    ActionSelectorMismatch,
    InvalidExecutionCalldata,
    InvalidExecutionValue,
    ExecutionFailed,
    OrgExecutorOrgMismatch
} from "../IsoErrors.sol";
import {IIsoOrgExecutor} from "../interfaces/IIsoOrgExecutor.sol";

contract IsoOrgExecutor is IIsoOrgExecutor {
    address public immutable isoProposals;
    uint64 public immutable orgId;

    event ManagedCallExecuted(
        uint64 indexed orgId,
        uint64 indexed proposalId,
        address indexed target,
        address executor,
        uint256 value,
        bytes4 actionSelector,
        bytes32 dataHash
    );

    constructor(address isoProposalsAddress, uint64 executorOrgId) {
        if (isoProposalsAddress == address(0)) {
            revert ZeroAddress();
        }
        isoProposals = isoProposalsAddress;
        orgId = executorOrgId;
    }

    function executeGovernedCall(
        uint64 requestedOrgId,
        uint64 proposalId,
        address target,
        uint256 value,
        bytes4 actionSelector,
        bytes32 dataHash,
        bytes calldata actionData
    ) external payable returns (bytes memory result) {
        if (msg.sender != isoProposals) {
            revert Unauthorized(msg.sender);
        }
        if (requestedOrgId != orgId) {
            revert OrgExecutorOrgMismatch(orgId, requestedOrgId);
        }
        if (target == address(0)) {
            revert ZeroAddress();
        }
        if (msg.value != value) {
            revert InvalidExecutionValue(value, msg.value);
        }
        bytes4 actualSelector = _executionSelector(actionData);
        if (actualSelector != actionSelector) {
            revert ActionSelectorMismatch(actionSelector, actualSelector);
        }
        bytes32 actualDataHash = keccak256(actionData);
        if (actualDataHash != dataHash) {
            revert DataHashMismatch(dataHash, actualDataHash);
        }
        (bool success, bytes memory callResult) = target.call{value: value}(actionData);
        if (!success) {
            revert ExecutionFailed(callResult);
        }
        emit ManagedCallExecuted(requestedOrgId, proposalId, target, address(this), value, actionSelector, dataHash);
        result = callResult;
    }

    function _executionSelector(bytes calldata actionData) internal pure returns (bytes4 selector) {
        if (actionData.length < 4) {
            revert InvalidExecutionCalldata();
        }
        assembly {
            selector := calldataload(actionData.offset)
        }
    }
}
