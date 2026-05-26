// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessManaged} from "@openzeppelin/contracts/access/manager/AccessManaged.sol";

contract IsoAccessManagedTarget is AccessManaged {
    uint64 public lastOrgId;
    uint256 public number;
    bool public emergencyPaused;
    address public lastCaller;
    bytes32 public lastActionHash;

    event NumberSet(uint64 indexed orgId, uint256 number, address indexed caller);
    event EmergencyPauseSet(uint64 indexed orgId, bool paused, address indexed caller);
    event UnconfiguredAction(uint64 indexed orgId, address indexed caller);

    constructor(address initialAuthority) AccessManaged(initialAuthority) {}

    function setNumber(uint64 orgId, uint256 newNumber) external restricted {
        lastOrgId = orgId;
        number = newNumber;
        lastCaller = msg.sender;
        lastActionHash = keccak256(msg.data);
        emit NumberSet(orgId, newNumber, msg.sender);
    }

    function setEmergencyPause(uint64 orgId, bool paused) external restricted {
        lastOrgId = orgId;
        emergencyPaused = paused;
        lastCaller = msg.sender;
        lastActionHash = keccak256(msg.data);
        emit EmergencyPauseSet(orgId, paused, msg.sender);
    }

    function unconfiguredAction(uint64 orgId) external restricted {
        lastOrgId = orgId;
        lastCaller = msg.sender;
        lastActionHash = keccak256(msg.data);
        emit UnconfiguredAction(orgId, msg.sender);
    }
}
