// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ZeroAddress, Unauthorized} from "../IsoErrors.sol";

contract ManagedExecutionTarget {
    address public immutable authorizedCaller;
    address public lastCaller;
    uint64 public lastOrgId;
    uint256 public number;
    uint256 public lastValue;
    bytes32 public lastActionHash;

    event NumberSet(uint64 indexed orgId, uint256 number, uint256 value, address indexed caller);

    modifier onlyAuthorizedCaller() {
        if (msg.sender != authorizedCaller) {
            revert Unauthorized(msg.sender);
        }
        _;
    }

    constructor(address authorizedCallerAddress) {
        if (authorizedCallerAddress == address(0)) {
            revert ZeroAddress();
        }
        authorizedCaller = authorizedCallerAddress;
    }

    function setNumber(uint64 orgId, uint256 newNumber) external payable onlyAuthorizedCaller {
        lastCaller = msg.sender;
        lastOrgId = orgId;
        number = newNumber;
        lastValue = msg.value;
        lastActionHash = keccak256(msg.data);
        emit NumberSet(orgId, newNumber, msg.value, msg.sender);
    }
}
