// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.28;

import {GovTypes} from "./GovTypes.sol";
import {IGovCore} from "./interfaces/IGovCore.sol";
import {
    ZeroAddress,
    EmptySlug,
    SlugAlreadyExists,
    OrganizationNotFound,
    OrganizationNotActive,
    Unauthorized,
    BodyNotFound,
    BodyDoesNotBelongToOrg,
    RoleNotFound,
    RoleDoesNotBelongToOrg,
    MandateNotFound,
    InvalidMandateTimeRange,
    InvalidProposalType,
    InvalidOrganizationStatus,
    InvalidStatusTransition,
    InvalidBodyKind,
    InvalidRoleType,
    InvalidExecutorBody
} from "./GovErrors.sol";

contract GovCore is IGovCore {
    uint64 public nextOrgId = 1;
    uint64 public nextBodyId = 1;
    uint64 public nextRoleId = 1;
    uint64 public nextMandateId = 1;

    mapping(uint64 => GovTypes.Organization) public organizations;
    mapping(bytes32 => bool) public slugExists;
    mapping(uint64 => GovTypes.Body) public bodies;
    mapping(uint64 => GovTypes.Role) public roles;
    mapping(uint64 => GovTypes.Mandate) public mandates;
    mapping(uint64 => mapping(GovTypes.ProposalType => GovTypes.PolicyRule)) private policyRules;
    mapping(uint64 => uint64[]) private orgBodies;
    mapping(uint64 => uint64[]) private bodyRoles;
    mapping(address => uint64[]) private holderMandates;

    event OrganizationCreated(uint64 indexed orgId, string slug, address indexed admin, string metadataURI);
    event OrganizationUpdated(uint64 indexed orgId, string metadataURI);
    event OrganizationStatusChanged(uint64 indexed orgId, GovTypes.OrganizationStatus status);
    event BodyCreated(uint64 indexed orgId, uint64 indexed bodyId, GovTypes.BodyKind kind, string metadataURI);
    event BodyUpdated(uint64 indexed orgId, uint64 indexed bodyId, bool active, string metadataURI);
    event RoleCreated(uint64 indexed orgId, uint64 indexed roleId, uint64 indexed bodyId, GovTypes.RoleType roleType, string metadataURI);
    event RoleUpdated(uint64 indexed orgId, uint64 indexed roleId, bool active, string metadataURI);
    event MandateAssigned(
        uint64 indexed orgId,
        uint64 indexed mandateId,
        uint64 indexed roleId,
        uint64 bodyId,
        address holder,
        uint64 startTime,
        uint64 endTime,
        uint256 proposalTypeMask,
        uint128 spendingLimit
    );
    event MandateRevoked(uint64 indexed orgId, uint64 indexed mandateId, address indexed holder);
    event PolicyRuleSet(
        uint64 indexed orgId,
        GovTypes.ProposalType indexed proposalType,
        uint64[] requiredApprovalBodies,
        uint64[] vetoBodies,
        uint64 executorBody,
        uint64 timelockSeconds,
        bool enabled
    );

    function proposalTypeBit(GovTypes.ProposalType proposalType) public pure returns (uint256 bit) {
        if (proposalType == GovTypes.ProposalType.Unknown) {
            revert InvalidProposalType();
        }
        bit = uint256(1) << uint8(proposalType);
    }

    function createOrganization(string calldata slug, string calldata metadataURI, address admin) external returns (uint64 orgId) {
        bytes32 slugHash = _slugHash(slug);
        if (admin == address(0)) {
            revert ZeroAddress();
        }
        if (bytes(slug).length == 0) {
            revert EmptySlug();
        }
        if (slugExists[slugHash]) {
            revert SlugAlreadyExists();
        }
        orgId = nextOrgId;
        nextOrgId = orgId + 1;
        organizations[orgId] = GovTypes.Organization({
            id: orgId,
            admin: admin,
            status: GovTypes.OrganizationStatus.Active,
            createdAt: _currentTimestamp(),
            slug: slug,
            metadataURI: metadataURI
        });
        slugExists[slugHash] = true;
        emit OrganizationCreated(orgId, slug, admin, metadataURI);
    }

    function updateOrganizationMetadata(uint64 orgId, string calldata metadataURI) external {
        GovTypes.Organization storage organization = _requireOrganization(orgId);
        _requireOrgAdmin(organization);
        organization.metadataURI = metadataURI;
        emit OrganizationUpdated(orgId, metadataURI);
    }

    function setOrganizationStatus(uint64 orgId, GovTypes.OrganizationStatus status) external {
        GovTypes.Organization storage organization = _requireOrganization(orgId);
        _requireOrgAdmin(organization);
        _validateStatusTransition(organization.status, status);
        organization.status = status;
        emit OrganizationStatusChanged(orgId, status);
    }

    function createBody(uint64 orgId, GovTypes.BodyKind kind, string calldata metadataURI) external returns (uint64 bodyId) {
        _requireActiveOrgAdmin(orgId);
        if (kind == GovTypes.BodyKind.Unknown) {
            revert InvalidBodyKind();
        }
        bodyId = nextBodyId;
        nextBodyId = bodyId + 1;
        bodies[bodyId] = GovTypes.Body({
            id: bodyId,
            orgId: orgId,
            kind: kind,
            active: true,
            createdAt: _currentTimestamp(),
            metadataURI: metadataURI
        });
        orgBodies[orgId].push(bodyId);
        emit BodyCreated(orgId, bodyId, kind, metadataURI);
    }

    function updateBody(uint64 orgId, uint64 bodyId, bool active, string calldata metadataURI) external {
        GovTypes.Organization storage organization = _requireOrganization(orgId);
        GovTypes.Body storage body = _requireBodyInOrg(orgId, bodyId);
        _requireOrgAdmin(organization);
        body.active = active;
        body.metadataURI = metadataURI;
        emit BodyUpdated(orgId, bodyId, active, metadataURI);
    }

    function createRole(uint64 orgId, uint64 bodyId, GovTypes.RoleType roleType, string calldata metadataURI) external returns (uint64 roleId) {
        _requireActiveOrgAdmin(orgId);
        _requireBodyInOrg(orgId, bodyId);
        if (roleType == GovTypes.RoleType.Unknown) {
            revert InvalidRoleType();
        }
        roleId = nextRoleId;
        nextRoleId = roleId + 1;
        roles[roleId] = GovTypes.Role({
            id: roleId,
            orgId: orgId,
            bodyId: bodyId,
            roleType: roleType,
            active: true,
            metadataURI: metadataURI
        });
        bodyRoles[bodyId].push(roleId);
        emit RoleCreated(orgId, roleId, bodyId, roleType, metadataURI);
    }

    function updateRole(uint64 orgId, uint64 roleId, bool active, string calldata metadataURI) external {
        GovTypes.Organization storage organization = _requireOrganization(orgId);
        GovTypes.Role storage role = _requireRoleInOrg(orgId, roleId);
        _requireOrgAdmin(organization);
        role.active = active;
        role.metadataURI = metadataURI;
        emit RoleUpdated(orgId, roleId, active, metadataURI);
    }

    function assignMandate(
        uint64 orgId,
        uint64 roleId,
        address holder,
        uint64 startTime,
        uint64 endTime,
        uint256 proposalTypeMask,
        uint128 spendingLimit
    ) external returns (uint64 mandateId) {
        _requireActiveOrgAdmin(orgId);
        GovTypes.Role storage role = _requireRoleInOrg(orgId, roleId);
        GovTypes.Body storage body = _requireBodyInOrg(orgId, role.bodyId);
        if (holder == address(0)) {
            revert ZeroAddress();
        }
        if (endTime != 0 && endTime <= startTime) {
            revert InvalidMandateTimeRange();
        }
        mandateId = nextMandateId;
        nextMandateId = mandateId + 1;
        mandates[mandateId] = GovTypes.Mandate({
            id: mandateId,
            orgId: orgId,
            bodyId: body.id,
            roleId: roleId,
            holder: holder,
            startTime: startTime,
            endTime: endTime,
            proposalTypeMask: proposalTypeMask,
            spendingLimit: spendingLimit,
            active: true,
            revoked: false
        });
        holderMandates[holder].push(mandateId);
        emit MandateAssigned(orgId, mandateId, roleId, body.id, holder, startTime, endTime, proposalTypeMask, spendingLimit);
    }

    function revokeMandate(uint64 orgId, uint64 mandateId) external {
        GovTypes.Organization storage organization = _requireOrganization(orgId);
        GovTypes.Mandate storage mandate = _requireMandateInOrg(orgId, mandateId);
        _requireOrgAdmin(organization);
        if (mandate.revoked) {
            revert Unauthorized(msg.sender);
        }
        mandate.revoked = true;
        mandate.active = false;
        emit MandateRevoked(orgId, mandateId, mandate.holder);
    }

    function setPolicyRule(
        uint64 orgId,
        GovTypes.ProposalType proposalType,
        uint64[] calldata requiredApprovalBodies,
        uint64[] calldata vetoBodies,
        uint64 executorBody,
        uint64 timelockSeconds,
        bool enabled
    ) external {
        _requireActiveOrgAdmin(orgId);
        if (proposalType == GovTypes.ProposalType.Unknown) {
            revert InvalidProposalType();
        }
        _validateBodies(orgId, requiredApprovalBodies);
        _validateBodies(orgId, vetoBodies);
        if (enabled) {
            _requireValidExecutorBody(orgId, executorBody);
        }
        if (!enabled && executorBody != 0) {
            _requireValidExecutorBody(orgId, executorBody);
        }
        GovTypes.PolicyRule storage rule = policyRules[orgId][proposalType];
        delete rule.requiredApprovalBodies;
        delete rule.vetoBodies;
        rule.orgId = orgId;
        rule.proposalType = proposalType;
        rule.executorBody = executorBody;
        rule.timelockSeconds = timelockSeconds;
        rule.enabled = enabled;
        _writeUint64Array(rule.requiredApprovalBodies, requiredApprovalBodies);
        _writeUint64Array(rule.vetoBodies, vetoBodies);
        emit PolicyRuleSet(orgId, proposalType, requiredApprovalBodies, vetoBodies, executorBody, timelockSeconds, enabled);
    }

    function getPolicyRule(uint64 orgId, GovTypes.ProposalType proposalType) external view returns (GovTypes.PolicyRule memory rule) {
        GovTypes.PolicyRule storage storedRule = policyRules[orgId][proposalType];
        rule.orgId = storedRule.orgId;
        rule.proposalType = storedRule.proposalType;
        rule.requiredApprovalBodies = _copyUint64Array(storedRule.requiredApprovalBodies);
        rule.vetoBodies = _copyUint64Array(storedRule.vetoBodies);
        rule.executorBody = storedRule.executorBody;
        rule.timelockSeconds = storedRule.timelockSeconds;
        rule.enabled = storedRule.enabled;
    }

    function isOrganizationActive(uint64 orgId) public view returns (bool isActive) {
        GovTypes.Organization storage organization = organizations[orgId];
        isActive = organization.id != 0 && organization.status == GovTypes.OrganizationStatus.Active;
    }

    function isOrganizationAdmin(uint64 orgId, address actor) public view returns (bool isAdmin) {
        GovTypes.Organization storage organization = organizations[orgId];
        isAdmin = organization.id != 0 && organization.admin == actor;
    }

    function hasRole(
        uint64 orgId,
        address actor,
        GovTypes.RoleType roleType,
        GovTypes.ProposalType proposalType
    ) external view returns (bool hasMatchingRole) {
        hasMatchingRole = _hasRole(orgId, actor, roleType, proposalType);
    }

    function canActOnProposalType(
        uint64 orgId,
        address actor,
        uint64 bodyId,
        GovTypes.RoleType roleType,
        GovTypes.ProposalType proposalType
    ) external view returns (bool canAct) {
        canAct = _hasMandate(orgId, actor, bodyId, roleType, proposalType);
    }

    function isBodyMember(uint64 orgId, address actor, uint64 bodyId) external view returns (bool isMember) {
        uint64[] storage mandateIds = holderMandates[actor];
        uint256 mandateCount = mandateIds.length;
        for (uint256 index = 0; index < mandateCount; index++) {
            GovTypes.Mandate storage mandate = mandates[mandateIds[index]];
            if (_isActiveBodyMembership(mandate, orgId, actor, bodyId)) {
                return true;
            }
        }
        isMember = false;
    }

    function bodyBelongsToOrg(uint64 orgId, uint64 bodyId) public view returns (bool belongs) {
        GovTypes.Body storage body = bodies[bodyId];
        belongs = body.id != 0 && body.orgId == orgId;
    }

    function _hasRole(
        uint64 orgId,
        address actor,
        GovTypes.RoleType roleType,
        GovTypes.ProposalType proposalType
    ) internal view returns (bool hasMatchingRole) {
        uint64[] storage mandateIds = holderMandates[actor];
        uint256 mandateCount = mandateIds.length;
        for (uint256 index = 0; index < mandateCount; index++) {
            GovTypes.Mandate storage mandate = mandates[mandateIds[index]];
            if (_isActiveMandate(mandate, orgId, actor, roleType, proposalType)) {
                return true;
            }
        }
        hasMatchingRole = false;
    }

    function _hasMandate(
        uint64 orgId,
        address actor,
        uint64 bodyId,
        GovTypes.RoleType roleType,
        GovTypes.ProposalType proposalType
    ) internal view returns (bool hasMatchingMandate) {
        uint64[] storage mandateIds = holderMandates[actor];
        uint256 mandateCount = mandateIds.length;
        for (uint256 index = 0; index < mandateCount; index++) {
            GovTypes.Mandate storage mandate = mandates[mandateIds[index]];
            if (_isActiveMandateForBody(mandate, orgId, actor, bodyId, roleType, proposalType)) {
                return true;
            }
        }
        hasMatchingMandate = false;
    }

    function _isActiveMandate(
        GovTypes.Mandate storage mandate,
        uint64 orgId,
        address actor,
        GovTypes.RoleType roleType,
        GovTypes.ProposalType proposalType
    ) internal view returns (bool isValid) {
        GovTypes.Role storage role = roles[mandate.roleId];
        GovTypes.Body storage body = bodies[mandate.bodyId];
        if (proposalType == GovTypes.ProposalType.Unknown) {
            return false;
        }
        if (!_isMandateTimeValid(mandate, actor, orgId)) {
            return false;
        }
        if (role.id == 0 || role.orgId != orgId || role.bodyId != mandate.bodyId || role.roleType != roleType || !role.active) {
            return false;
        }
        if (body.id == 0 || body.orgId != orgId || !body.active) {
            return false;
        }
        isValid = (mandate.proposalTypeMask & proposalTypeBit(proposalType)) != 0;
    }

    function _isActiveMandateForBody(
        GovTypes.Mandate storage mandate,
        uint64 orgId,
        address actor,
        uint64 bodyId,
        GovTypes.RoleType roleType,
        GovTypes.ProposalType proposalType
    ) internal view returns (bool isValid) {
        if (mandate.bodyId != bodyId) {
            return false;
        }
        isValid = _isActiveMandate(mandate, orgId, actor, roleType, proposalType);
    }

    function _isActiveBodyMembership(
        GovTypes.Mandate storage mandate,
        uint64 orgId,
        address actor,
        uint64 bodyId
    ) internal view returns (bool isValid) {
        GovTypes.Role storage role = roles[mandate.roleId];
        GovTypes.Body storage body = bodies[mandate.bodyId];
        if (!_isMandateTimeValid(mandate, actor, orgId)) {
            return false;
        }
        if (mandate.bodyId != bodyId) {
            return false;
        }
        if (role.id == 0 || role.orgId != orgId || role.bodyId != bodyId || !role.active) {
            return false;
        }
        isValid = body.id != 0 && body.orgId == orgId && body.active;
    }

    function _isMandateTimeValid(GovTypes.Mandate storage mandate, address actor, uint64 orgId) internal view returns (bool isValid) {
        uint64 currentTime = _currentTimestamp();
        if (!mandate.active || mandate.revoked) {
            return false;
        }
        if (mandate.holder != actor || mandate.orgId != orgId) {
            return false;
        }
        if (currentTime < mandate.startTime) {
            return false;
        }
        if (mandate.endTime != 0 && currentTime > mandate.endTime) {
            return false;
        }
        isValid = true;
    }

    function _requireOrganization(uint64 orgId) internal view returns (GovTypes.Organization storage organization) {
        organization = organizations[orgId];
        if (organization.id == 0) {
            revert OrganizationNotFound(orgId);
        }
    }

    function _requireOrgAdmin(GovTypes.Organization storage organization) internal view {
        if (organization.admin != msg.sender) {
            revert Unauthorized(msg.sender);
        }
    }

    function _requireActiveOrgAdmin(uint64 orgId) internal view returns (GovTypes.Organization storage organization) {
        organization = _requireOrganization(orgId);
        if (organization.status != GovTypes.OrganizationStatus.Active) {
            revert OrganizationNotActive(orgId);
        }
        _requireOrgAdmin(organization);
    }

    function _requireBodyInOrg(uint64 orgId, uint64 bodyId) internal view returns (GovTypes.Body storage body) {
        body = bodies[bodyId];
        if (body.id == 0) {
            revert BodyNotFound(bodyId);
        }
        if (body.orgId != orgId) {
            revert BodyDoesNotBelongToOrg(orgId, bodyId);
        }
    }

    function _requireRoleInOrg(uint64 orgId, uint64 roleId) internal view returns (GovTypes.Role storage role) {
        role = roles[roleId];
        if (role.id == 0) {
            revert RoleNotFound(roleId);
        }
        if (role.orgId != orgId) {
            revert RoleDoesNotBelongToOrg(orgId, roleId);
        }
    }

    function _requireMandateInOrg(uint64 orgId, uint64 mandateId) internal view returns (GovTypes.Mandate storage mandate) {
        mandate = mandates[mandateId];
        if (mandate.id == 0) {
            revert MandateNotFound(mandateId);
        }
        if (mandate.orgId != orgId) {
            revert Unauthorized(msg.sender);
        }
    }

    function _validateStatusTransition(
        GovTypes.OrganizationStatus currentStatus,
        GovTypes.OrganizationStatus nextStatus
    ) internal pure {
        if (nextStatus == GovTypes.OrganizationStatus.None) {
            revert InvalidOrganizationStatus(nextStatus);
        }
        if (currentStatus == GovTypes.OrganizationStatus.Archived && nextStatus != GovTypes.OrganizationStatus.Archived) {
            revert InvalidStatusTransition(currentStatus, nextStatus);
        }
    }

    function _validateBodies(uint64 orgId, uint64[] calldata bodyIds) internal view {
        uint256 bodyCount = bodyIds.length;
        for (uint256 index = 0; index < bodyCount; index++) {
            _requireBodyInOrg(orgId, bodyIds[index]);
        }
    }

    function _requireValidExecutorBody(uint64 orgId, uint64 bodyId) internal view {
        if (bodyId == 0) {
            revert InvalidExecutorBody();
        }
        _requireBodyInOrg(orgId, bodyId);
    }

    function _writeUint64Array(uint64[] storage target, uint64[] calldata source) internal {
        uint256 sourceLength = source.length;
        for (uint256 index = 0; index < sourceLength; index++) {
            target.push(source[index]);
        }
    }

    function _copyUint64Array(uint64[] storage source) internal view returns (uint64[] memory copy) {
        uint256 sourceLength = source.length;
        copy = new uint64[](sourceLength);
        for (uint256 index = 0; index < sourceLength; index++) {
            copy[index] = source[index];
        }
    }

    function _slugHash(string calldata slug) internal pure returns (bytes32 slugHash) {
        slugHash = keccak256(bytes(slug));
    }

    function _currentTimestamp() internal view returns (uint64 timestamp) {
        timestamp = uint64(block.timestamp);
    }
}
