// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract IsoAccessControlTarget is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("ISONIA_DEMO_OPERATOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("ISONIA_DEMO_EMERGENCY_ROLE");

    uint64 public lastOrgId;
    uint256 public number;
    bool public emergencyPaused;
    address public lastCaller;
    bytes32 public lastActionHash;

    event NumberSet(uint64 indexed orgId, uint256 number, address indexed caller);
    event EmergencyPauseSet(uint64 indexed orgId, bool paused, address indexed caller);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function setNumber(uint64 orgId, uint256 newNumber) external onlyRole(OPERATOR_ROLE) {
        lastOrgId = orgId;
        number = newNumber;
        lastCaller = msg.sender;
        lastActionHash = keccak256(msg.data);
        emit NumberSet(orgId, newNumber, msg.sender);
    }

    function setEmergencyPause(uint64 orgId, bool paused) external onlyRole(EMERGENCY_ROLE) {
        lastOrgId = orgId;
        emergencyPaused = paused;
        lastCaller = msg.sender;
        lastActionHash = keccak256(msg.data);
        emit EmergencyPauseSet(orgId, paused, msg.sender);
    }
}
