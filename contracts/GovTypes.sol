// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library GovTypes {
    enum OrganizationStatus {
        None,
        Active,
        Paused,
        Archived
    }

    enum BodyKind {
        Unknown,
        GeneralCouncil,
        TreasuryCommittee,
        SecurityCouncil,
        CapitalHouse,
        MeritHouse,
        EmergencyCouncil,
        Custom
    }

    enum RoleType {
        Unknown,
        OrgAdmin,
        BodyAdmin,
        Proposer,
        Approver,
        Vetoer,
        Executor,
        EmergencyOperator
    }

    enum ProposalType {
        Unknown,
        Standard,
        Treasury,
        Upgrade,
        Emergency
    }

    enum ProposalStatus {
        None,
        Created,
        UnderReview,
        Approved,
        Queued,
        Vetoed,
        Executed,
        Cancelled,
        Expired
    }

    enum DecisionType {
        Unknown,
        Approve,
        Veto
    }

    struct Organization {
        uint64 id;
        address admin;
        OrganizationStatus status;
        uint64 createdAt;
        string slug;
        string metadataURI;
    }

    struct Body {
        uint64 id;
        uint64 orgId;
        BodyKind kind;
        bool active;
        uint64 createdAt;
        string metadataURI;
    }

    struct Role {
        uint64 id;
        uint64 orgId;
        uint64 bodyId;
        RoleType roleType;
        bool active;
        string metadataURI;
    }

    struct Mandate {
        uint64 id;
        uint64 orgId;
        uint64 bodyId;
        uint64 roleId;
        address holder;
        uint64 startTime;
        uint64 endTime;
        uint256 proposalTypeMask;
        uint128 spendingLimit;
        bool active;
        bool revoked;
    }

    struct PolicyRule {
        uint64 orgId;
        ProposalType proposalType;
        uint64 version;
        uint64[] requiredApprovalBodies;
        uint64[] vetoBodies;
        uint64 executorBody;
        uint64 timelockSeconds;
        bool enabled;
    }

    struct ExecutionTargetRule {
        bool enabled;
        uint256 maxValue;
    }

    struct BodyCreateInput {
        BodyKind kind;
        string metadataURI;
    }

    struct RoleCreateInput {
        uint64 bodyId;
        RoleType roleType;
        string metadataURI;
    }

    struct MandateAssignInput {
        uint64 roleId;
        address holder;
        uint64 startTime;
        uint64 endTime;
        uint256 proposalTypeMask;
        uint128 spendingLimit;
    }

    struct PolicyRuleSetInput {
        ProposalType proposalType;
        uint64[] requiredApprovalBodies;
        uint64[] vetoBodies;
        uint64 executorBody;
        uint64 timelockSeconds;
        bool enabled;
    }

    struct Proposal {
        uint64 id;
        uint64 orgId;
        ProposalType proposalType;
        uint64 policyVersion;
        ProposalStatus status;
        address creator;
        address target;
        uint256 value;
        bytes4 actionSelector;
        bytes32 dataHash;
        uint64 createdAt;
        uint64 queuedAt;
        uint64 executableAt;
        uint64 executedAt;
        string metadataURI;
    }
}
