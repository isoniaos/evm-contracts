// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IIsoOrgExecutor} from "../interfaces/IIsoOrgExecutor.sol";

contract IsoOrgExecutorCallerHarness {
    function execute(
        address executor,
        uint64 orgId,
        uint64 proposalId,
        address target,
        uint256 value,
        bytes4 actionSelector,
        bytes32 dataHash,
        bytes calldata actionData
    ) external payable returns (bytes memory result) {
        result = IIsoOrgExecutor(executor).executeGovernedCall{value: msg.value}(
            orgId,
            proposalId,
            target,
            value,
            actionSelector,
            dataHash,
            actionData
        );
    }
}
