// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract IsoOwnableTarget is Ownable {
    uint64 public lastOrgId;
    uint256 public number;
    bool public emergencyPaused;
    address public lastCaller;
    bytes32 public lastActionHash;

    event NumberSet(uint64 indexed orgId, uint256 number, address indexed caller);
    event EmergencyPauseSet(uint64 indexed orgId, bool paused, address indexed caller);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setNumber(uint64 orgId, uint256 newNumber) external onlyOwner {
        lastOrgId = orgId;
        number = newNumber;
        lastCaller = msg.sender;
        lastActionHash = keccak256(msg.data);
        emit NumberSet(orgId, newNumber, msg.sender);
    }

    function setEmergencyPause(uint64 orgId, bool paused) external onlyOwner {
        lastOrgId = orgId;
        emergencyPaused = paused;
        lastCaller = msg.sender;
        lastActionHash = keccak256(msg.data);
        emit EmergencyPauseSet(orgId, paused, msg.sender);
    }
}
