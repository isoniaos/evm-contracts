// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IIsoOrgExecutor {
    function govProposals() external view returns (address);
    function orgId() external view returns (uint64);

    function executeGovernedCall(
        uint64 orgId,
        uint64 proposalId,
        address target,
        uint256 value,
        bytes4 actionSelector,
        bytes32 dataHash,
        bytes calldata actionData
    ) external payable returns (bytes memory result);
}
