// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ZeroAddress, Unauthorized} from "./GovErrors.sol";

contract DemoTarget {
    address public immutable owner;
    address public govProposals;
    uint64 public lastOrgId;
    uint256 public number;
    bytes32 public lastActionHash;

    event GovProposalsSet(address indexed govProposalsAddress);
    event NumberSet(uint64 indexed orgId, uint256 number, uint256 value);

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized(msg.sender);
        }
        _;
    }

    modifier onlyGovProposals() {
        if (msg.sender != govProposals) {
            revert Unauthorized(msg.sender);
        }
        _;
    }

    constructor(address ownerAddress) {
        if (ownerAddress == address(0)) {
            revert ZeroAddress();
        }
        owner = ownerAddress;
    }

    function setGovProposals(address govProposalsAddress) external onlyOwner {
        if (govProposalsAddress == address(0)) {
            revert ZeroAddress();
        }
        govProposals = govProposalsAddress;
        emit GovProposalsSet(govProposalsAddress);
    }

    function setNumber(uint64 orgId, uint256 newNumber) external payable onlyGovProposals {
        lastOrgId = orgId;
        number = newNumber;
        lastActionHash = keccak256(msg.data);
        emit NumberSet(orgId, newNumber, msg.value);
    }
}
