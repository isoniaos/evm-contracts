// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ZeroAddress, Unauthorized} from "../GovErrors.sol";

error NativePaymentTransferFailed(address recipient, uint256 amount);

contract DemoTarget {
    address public immutable owner;
    address public govProposals;
    uint64 public lastOrgId;
    uint256 public number;
    bytes32 public lastActionHash;

    mapping(uint64 => mapping(bytes32 => bool)) public featureEnabled;
    mapping(uint64 => mapping(bytes32 => uint256)) public uintParams;
    mapping(uint64 => mapping(bytes32 => bool)) public obligationAccepted;
    mapping(uint64 => mapping(bytes32 => bool)) public obligationCancelled;
    mapping(uint64 => mapping(bytes32 => string)) public obligationCancellationReason;

    event GovProposalsSet(address indexed govProposalsAddress);
    event NumberSet(uint64 indexed orgId, uint256 number, uint256 value);
    event FeatureEnabledSet(uint64 indexed orgId, bytes32 indexed feature, bool enabled);
    event UintParamSet(uint64 indexed orgId, bytes32 indexed key, uint256 value);
    event NativePaymentReleased(uint64 indexed orgId, bytes32 indexed obligationId, address indexed recipient, uint256 amount);
    event ObligationAccepted(uint64 indexed orgId, bytes32 indexed obligationId);
    event ObligationCancelled(uint64 indexed orgId, bytes32 indexed obligationId, string reason);

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

    function setFeatureEnabled(uint64 orgId, bytes32 feature, bool enabled) external onlyGovProposals {
        lastOrgId = orgId;
        featureEnabled[orgId][feature] = enabled;
        lastActionHash = keccak256(msg.data);
        emit FeatureEnabledSet(orgId, feature, enabled);
    }

    function setUintParam(uint64 orgId, bytes32 key, uint256 value) external onlyGovProposals {
        lastOrgId = orgId;
        uintParams[orgId][key] = value;
        lastActionHash = keccak256(msg.data);
        emit UintParamSet(orgId, key, value);
    }

    function releaseNativePayment(uint64 orgId, bytes32 obligationId, address payable recipient) external payable onlyGovProposals {
        if (recipient == address(0)) {
            revert ZeroAddress();
        }
        lastOrgId = orgId;
        lastActionHash = keccak256(msg.data);
        uint256 amount = msg.value;
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) {
            revert NativePaymentTransferFailed(recipient, amount);
        }
        emit NativePaymentReleased(orgId, obligationId, recipient, amount);
    }

    function markObligationAccepted(uint64 orgId, bytes32 obligationId) external onlyGovProposals {
        lastOrgId = orgId;
        obligationAccepted[orgId][obligationId] = true;
        lastActionHash = keccak256(msg.data);
        emit ObligationAccepted(orgId, obligationId);
    }

    function markObligationCancelled(uint64 orgId, bytes32 obligationId, string calldata reason) external onlyGovProposals {
        lastOrgId = orgId;
        obligationCancelled[orgId][obligationId] = true;
        obligationCancellationReason[orgId][obligationId] = reason;
        lastActionHash = keccak256(msg.data);
        emit ObligationCancelled(orgId, obligationId, reason);
    }
}
