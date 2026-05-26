// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IsoTypes} from "./IsoTypes.sol";
import {IIsoCore} from "./interfaces/IIsoCore.sol";
import {
    ZeroAddress,
    EmptySlug,
    SlugAlreadyExists,
    OrganizationNotFound,
    OrganizationNotActive,
    OrganizationAlreadyFinalized,
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
    InvalidExecutorBody,
    EmptyBatch
} from "./IsoErrors.sol";

contract IsoCore is IIsoCore {
    uint64 public nextOrgId = 1;
    uint64 public nextBodyId = 1;
    uint64 public nextRoleId = 1;
    uint64 public nextMandateId = 1;

    mapping(uint64 => IsoTypes.Organization) public organizations;
    mapping(uint64 => bool) private organizationFinalized;
    mapping(bytes32 => bool) public slugExists;
    mapping(uint64 => IsoTypes.Body) public bodies;
    mapping(uint64 => IsoTypes.Role) public roles;
    mapping(uint64 => IsoTypes.Mandate) public mandates;
    mapping(uint64 => mapping(IsoTypes.ProposalType => IsoTypes.PolicyRule)) private policyRules;
    mapping(uint64 => mapping(IsoTypes.ProposalType => mapping(uint64 => IsoTypes.PolicyRule))) private policyRuleVersions;
    mapping(uint64 => mapping(IsoTypes.ProposalType => uint64)) public policyVersion;
    mapping(uint64 => uint64[]) private orgBodies;
    mapping(uint64 => uint64[]) private bodyRoles;
    mapping(address => mapping(uint64 => uint64[])) private holderOrgMandates;

    event OrganizationCreated(uint64 indexed orgId, string slug, address indexed admin, string metadataURI);
    event OrganizationUpdated(uint64 indexed orgId, string metadataURI);
    event OrganizationStatusChanged(uint64 indexed orgId, IsoTypes.OrganizationStatus status);
    event OrganizationFinalized(uint64 indexed orgId, address indexed admin);
    event BodyCreated(uint64 indexed orgId, uint64 indexed bodyId, IsoTypes.BodyKind kind, string metadataURI);
    event BodyUpdated(uint64 indexed orgId, uint64 indexed bodyId, bool active, string metadataURI);
    event RoleCreated(uint64 indexed orgId, uint64 indexed roleId, uint64 indexed bodyId, IsoTypes.RoleType roleType, string metadataURI);
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
        IsoTypes.ProposalType indexed proposalType,
        uint64 version,
        uint64[] requiredApprovalBodies,
        uint64[] vetoBodies,
        uint64 executorBody,
        uint64 timelockSeconds,
        bool enabled
    );

    modifier onlyOrgAdmin(uint64 orgId) {
        _requireOrgAdmin(orgId);
        _;
    }

    modifier onlyActiveOrgAdmin(uint64 orgId) {
        _requireActiveOrgAdmin(orgId);
        _;
    }

    modifier onlyNotFinalized(uint64 orgId) {
        _requireNotFinalized(orgId);
        _;
    }

    function proposalTypeBit(IsoTypes.ProposalType proposalType) public pure returns (uint256 bit) {
        if (proposalType == IsoTypes.ProposalType.Unknown) {
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
        organizations[orgId] = IsoTypes.Organization({
            id: orgId,
            admin: admin,
            status: IsoTypes.OrganizationStatus.Active,
            createdAt: _currentTimestamp(),
            slug: slug,
            metadataURI: metadataURI
        });
        slugExists[slugHash] = true;
        emit OrganizationCreated(orgId, slug, admin, metadataURI);
    }

    function updateOrganizationMetadata(uint64 orgId, string calldata metadataURI) external onlyOrgAdmin(orgId) {
        organizations[orgId].metadataURI = metadataURI;
        emit OrganizationUpdated(orgId, metadataURI);
    }

    function finalizeOrganization(uint64 orgId) external onlyActiveOrgAdmin(orgId) onlyNotFinalized(orgId) {
        organizationFinalized[orgId] = true;
        emit OrganizationFinalized(orgId, msg.sender);
    }

    function setOrganizationStatus(uint64 orgId, IsoTypes.OrganizationStatus status) external onlyOrgAdmin(orgId) onlyNotFinalized(orgId) {
        IsoTypes.Organization storage organization = organizations[orgId];
        _validateStatusTransition(organization.status, status);
        organization.status = status;
        emit OrganizationStatusChanged(orgId, status);
    }

    function createBody(
        uint64 orgId,
        IsoTypes.BodyKind kind,
        string calldata metadataURI
    ) external onlyActiveOrgAdmin(orgId) onlyNotFinalized(orgId) returns (uint64 bodyId) {
        bodyId = _createBody(orgId, kind, metadataURI);
    }

    function batchCreateBodies(
        uint64 orgId,
        IsoTypes.BodyCreateInput[] calldata inputs
    ) external onlyActiveOrgAdmin(orgId) onlyNotFinalized(orgId) returns (uint64[] memory bodyIds) {
        uint256 inputCount = inputs.length;
        _requireNonEmptyBatch(inputCount);
        bodyIds = new uint64[](inputCount);
        for (uint256 index = 0; index < inputCount; index++) {
            bodyIds[index] = _createBody(orgId, inputs[index].kind, inputs[index].metadataURI);
        }
    }

    function _createBody(uint64 orgId, IsoTypes.BodyKind kind, string calldata metadataURI) internal returns (uint64 bodyId) {
        if (kind == IsoTypes.BodyKind.Unknown) {
            revert InvalidBodyKind();
        }
        bodyId = nextBodyId;
        nextBodyId = bodyId + 1;
        bodies[bodyId] = IsoTypes.Body({
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

    function updateBody(uint64 orgId, uint64 bodyId, bool active, string calldata metadataURI) external onlyOrgAdmin(orgId) onlyNotFinalized(orgId) {
        IsoTypes.Body storage body = _requireBodyInOrg(orgId, bodyId);
        body.active = active;
        body.metadataURI = metadataURI;
        emit BodyUpdated(orgId, bodyId, active, metadataURI);
    }

    function createRole(
        uint64 orgId,
        uint64 bodyId,
        IsoTypes.RoleType roleType,
        string calldata metadataURI
    ) external onlyActiveOrgAdmin(orgId) onlyNotFinalized(orgId) returns (uint64 roleId) {
        roleId = _createRole(orgId, bodyId, roleType, metadataURI);
    }

    function batchCreateRoles(
        uint64 orgId,
        IsoTypes.RoleCreateInput[] calldata inputs
    ) external onlyActiveOrgAdmin(orgId) onlyNotFinalized(orgId) returns (uint64[] memory roleIds) {
        uint256 inputCount = inputs.length;
        _requireNonEmptyBatch(inputCount);
        roleIds = new uint64[](inputCount);
        for (uint256 index = 0; index < inputCount; index++) {
            roleIds[index] = _createRole(orgId, inputs[index].bodyId, inputs[index].roleType, inputs[index].metadataURI);
        }
    }

    function _createRole(
        uint64 orgId,
        uint64 bodyId,
        IsoTypes.RoleType roleType,
        string calldata metadataURI
    ) internal returns (uint64 roleId) {
        _requireBodyInOrg(orgId, bodyId);
        if (roleType == IsoTypes.RoleType.Unknown) {
            revert InvalidRoleType();
        }
        roleId = nextRoleId;
        nextRoleId = roleId + 1;
        roles[roleId] = IsoTypes.Role({
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

    function updateRole(uint64 orgId, uint64 roleId, bool active, string calldata metadataURI) external onlyOrgAdmin(orgId) onlyNotFinalized(orgId) {
        IsoTypes.Role storage role = _requireRoleInOrg(orgId, roleId);
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
    ) external onlyActiveOrgAdmin(orgId) onlyNotFinalized(orgId) returns (uint64 mandateId) {
        mandateId = _assignMandate(orgId, roleId, holder, startTime, endTime, proposalTypeMask, spendingLimit);
    }

    function batchAssignMandates(
        uint64 orgId,
        IsoTypes.MandateAssignInput[] calldata inputs
    ) external onlyActiveOrgAdmin(orgId) onlyNotFinalized(orgId) returns (uint64[] memory mandateIds) {
        uint256 inputCount = inputs.length;
        _requireNonEmptyBatch(inputCount);
        mandateIds = new uint64[](inputCount);
        for (uint256 index = 0; index < inputCount; index++) {
            mandateIds[index] = _assignMandate(
                orgId,
                inputs[index].roleId,
                inputs[index].holder,
                inputs[index].startTime,
                inputs[index].endTime,
                inputs[index].proposalTypeMask,
                inputs[index].spendingLimit
            );
        }
    }

    function _assignMandate(
        uint64 orgId,
        uint64 roleId,
        address holder,
        uint64 startTime,
        uint64 endTime,
        uint256 proposalTypeMask,
        uint128 spendingLimit
    ) internal returns (uint64 mandateId) {
        IsoTypes.Role storage role = _requireRoleInOrg(orgId, roleId);
        IsoTypes.Body storage body = _requireBodyInOrg(orgId, role.bodyId);
        if (holder == address(0)) {
            revert ZeroAddress();
        }
        if (endTime != 0 && endTime <= startTime) {
            revert InvalidMandateTimeRange();
        }
        mandateId = nextMandateId;
        nextMandateId = mandateId + 1;
        mandates[mandateId] = IsoTypes.Mandate({
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
        holderOrgMandates[holder][orgId].push(mandateId);
        emit MandateAssigned(orgId, mandateId, roleId, body.id, holder, startTime, endTime, proposalTypeMask, spendingLimit);
    }

    function revokeMandate(uint64 orgId, uint64 mandateId) external onlyOrgAdmin(orgId) onlyNotFinalized(orgId) {
        IsoTypes.Mandate storage mandate = _requireMandateInOrg(orgId, mandateId);
        if (mandate.revoked) {
            revert Unauthorized(msg.sender);
        }
        mandate.revoked = true;
        mandate.active = false;
        emit MandateRevoked(orgId, mandateId, mandate.holder);
    }

    function setPolicyRule(
        uint64 orgId,
        IsoTypes.ProposalType proposalType,
        uint64[] calldata requiredApprovalBodies,
        uint64[] calldata vetoBodies,
        uint64 executorBody,
        uint64 timelockSeconds,
        bool enabled
    ) external onlyActiveOrgAdmin(orgId) onlyNotFinalized(orgId) {
        _setPolicyRule(orgId, proposalType, requiredApprovalBodies, vetoBodies, executorBody, timelockSeconds, enabled);
    }

    function batchSetPolicyRules(
        uint64 orgId,
        IsoTypes.PolicyRuleSetInput[] calldata inputs
    ) external onlyActiveOrgAdmin(orgId) onlyNotFinalized(orgId) {
        uint256 inputCount = inputs.length;
        _requireNonEmptyBatch(inputCount);
        for (uint256 index = 0; index < inputCount; index++) {
            _setPolicyRule(
                orgId,
                inputs[index].proposalType,
                inputs[index].requiredApprovalBodies,
                inputs[index].vetoBodies,
                inputs[index].executorBody,
                inputs[index].timelockSeconds,
                inputs[index].enabled
            );
        }
    }

    function _setPolicyRule(
        uint64 orgId,
        IsoTypes.ProposalType proposalType,
        uint64[] calldata requiredApprovalBodies,
        uint64[] calldata vetoBodies,
        uint64 executorBody,
        uint64 timelockSeconds,
        bool enabled
    ) internal {
        if (proposalType == IsoTypes.ProposalType.Unknown) {
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
        uint64 nextVersion = policyVersion[orgId][proposalType] + 1;
        policyVersion[orgId][proposalType] = nextVersion;
        _writePolicyRule(policyRules[orgId][proposalType], orgId, proposalType, nextVersion, requiredApprovalBodies, vetoBodies, executorBody, timelockSeconds, enabled);
        _writePolicyRule(policyRuleVersions[orgId][proposalType][nextVersion], orgId, proposalType, nextVersion, requiredApprovalBodies, vetoBodies, executorBody, timelockSeconds, enabled);
        emit PolicyRuleSet(orgId, proposalType, nextVersion, requiredApprovalBodies, vetoBodies, executorBody, timelockSeconds, enabled);
    }

    function getPolicyRule(uint64 orgId, IsoTypes.ProposalType proposalType) external view returns (IsoTypes.PolicyRule memory rule) {
        rule = _copyPolicyRule(policyRules[orgId][proposalType]);
    }

    function getPolicyRuleAtVersion(
        uint64 orgId,
        IsoTypes.ProposalType proposalType,
        uint64 version
    ) external view returns (IsoTypes.PolicyRule memory rule) {
        rule = _copyPolicyRule(policyRuleVersions[orgId][proposalType][version]);
    }

    function isOrganizationActive(uint64 orgId) public view returns (bool isActive) {
        IsoTypes.Organization storage organization = organizations[orgId];
        isActive = organization.id != 0 && organization.status == IsoTypes.OrganizationStatus.Active;
    }

    function isOrganizationFinalized(uint64 orgId) public view returns (bool isFinalized) {
        isFinalized = organizationFinalized[orgId];
    }

    function isOrganizationAdmin(uint64 orgId, address actor) public view returns (bool isAdmin) {
        IsoTypes.Organization storage organization = organizations[orgId];
        isAdmin = organization.id != 0 && organization.admin == actor;
    }

    function hasRole(
        uint64 orgId,
        address actor,
        IsoTypes.RoleType roleType,
        IsoTypes.ProposalType proposalType
    ) external view returns (bool hasMatchingRole) {
        hasMatchingRole = _hasRole(orgId, actor, roleType, proposalType);
    }

    function canActOnProposalType(
        uint64 orgId,
        address actor,
        uint64 bodyId,
        IsoTypes.RoleType roleType,
        IsoTypes.ProposalType proposalType
    ) external view returns (bool canAct) {
        canAct = _hasMandate(orgId, actor, bodyId, roleType, proposalType);
    }

    function isBodyMember(uint64 orgId, address actor, uint64 bodyId) external view returns (bool isMember) {
        uint64[] storage mandateIds = holderOrgMandates[actor][orgId];
        uint256 mandateCount = mandateIds.length;
        for (uint256 index = 0; index < mandateCount; index++) {
            IsoTypes.Mandate storage mandate = mandates[mandateIds[index]];
            if (_isActiveBodyMembership(mandate, orgId, actor, bodyId)) {
                return true;
            }
        }
        isMember = false;
    }

    function bodyBelongsToOrg(uint64 orgId, uint64 bodyId) public view returns (bool belongs) {
        IsoTypes.Body storage body = bodies[bodyId];
        belongs = body.id != 0 && body.orgId == orgId;
    }

    function _hasRole(
        uint64 orgId,
        address actor,
        IsoTypes.RoleType roleType,
        IsoTypes.ProposalType proposalType
    ) internal view returns (bool hasMatchingRole) {
        uint64[] storage mandateIds = holderOrgMandates[actor][orgId];
        uint256 mandateCount = mandateIds.length;
        for (uint256 index = 0; index < mandateCount; index++) {
            IsoTypes.Mandate storage mandate = mandates[mandateIds[index]];
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
        IsoTypes.RoleType roleType,
        IsoTypes.ProposalType proposalType
    ) internal view returns (bool hasMatchingMandate) {
        uint64[] storage mandateIds = holderOrgMandates[actor][orgId];
        uint256 mandateCount = mandateIds.length;
        for (uint256 index = 0; index < mandateCount; index++) {
            IsoTypes.Mandate storage mandate = mandates[mandateIds[index]];
            if (_isActiveMandateForBody(mandate, orgId, actor, bodyId, roleType, proposalType)) {
                return true;
            }
        }
        hasMatchingMandate = false;
    }

    function _isActiveMandate(
        IsoTypes.Mandate storage mandate,
        uint64 orgId,
        address actor,
        IsoTypes.RoleType roleType,
        IsoTypes.ProposalType proposalType
    ) internal view returns (bool isValid) {
        IsoTypes.Role storage role = roles[mandate.roleId];
        IsoTypes.Body storage body = bodies[mandate.bodyId];
        if (proposalType == IsoTypes.ProposalType.Unknown) {
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
        IsoTypes.Mandate storage mandate,
        uint64 orgId,
        address actor,
        uint64 bodyId,
        IsoTypes.RoleType roleType,
        IsoTypes.ProposalType proposalType
    ) internal view returns (bool isValid) {
        if (mandate.bodyId != bodyId) {
            return false;
        }
        isValid = _isActiveMandate(mandate, orgId, actor, roleType, proposalType);
    }

    function _isActiveBodyMembership(
        IsoTypes.Mandate storage mandate,
        uint64 orgId,
        address actor,
        uint64 bodyId
    ) internal view returns (bool isValid) {
        IsoTypes.Role storage role = roles[mandate.roleId];
        IsoTypes.Body storage body = bodies[mandate.bodyId];
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

    function _isMandateTimeValid(IsoTypes.Mandate storage mandate, address actor, uint64 orgId) internal view returns (bool isValid) {
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

    function _requireOrgAdmin(uint64 orgId) internal view {
        IsoTypes.Organization storage organization = organizations[orgId];
        if (organization.id == 0) {
            revert OrganizationNotFound(orgId);
        }
        if (organization.admin != msg.sender) {
            revert Unauthorized(msg.sender);
        }
    }

    function _requireActiveOrgAdmin(uint64 orgId) internal view {
        IsoTypes.Organization storage organization = organizations[orgId];
        if (organization.id == 0) {
            revert OrganizationNotFound(orgId);
        }
        if (organization.status != IsoTypes.OrganizationStatus.Active) {
            revert OrganizationNotActive(orgId);
        }
        if (organization.admin != msg.sender) {
            revert Unauthorized(msg.sender);
        }
    }

    function _requireNotFinalized(uint64 orgId) internal view {
        if (organizationFinalized[orgId]) {
            revert OrganizationAlreadyFinalized(orgId);
        }
    }

    function _requireBodyInOrg(uint64 orgId, uint64 bodyId) internal view returns (IsoTypes.Body storage body) {
        body = bodies[bodyId];
        if (body.id == 0) {
            revert BodyNotFound(bodyId);
        }
        if (body.orgId != orgId) {
            revert BodyDoesNotBelongToOrg(orgId, bodyId);
        }
    }

    function _requireRoleInOrg(uint64 orgId, uint64 roleId) internal view returns (IsoTypes.Role storage role) {
        role = roles[roleId];
        if (role.id == 0) {
            revert RoleNotFound(roleId);
        }
        if (role.orgId != orgId) {
            revert RoleDoesNotBelongToOrg(orgId, roleId);
        }
    }

    function _requireMandateInOrg(uint64 orgId, uint64 mandateId) internal view returns (IsoTypes.Mandate storage mandate) {
        mandate = mandates[mandateId];
        if (mandate.id == 0) {
            revert MandateNotFound(mandateId);
        }
        if (mandate.orgId != orgId) {
            revert Unauthorized(msg.sender);
        }
    }

    function _validateStatusTransition(
        IsoTypes.OrganizationStatus currentStatus,
        IsoTypes.OrganizationStatus nextStatus
    ) internal pure {
        if (nextStatus == IsoTypes.OrganizationStatus.None) {
            revert InvalidOrganizationStatus(nextStatus);
        }
        if (currentStatus == IsoTypes.OrganizationStatus.Archived && nextStatus != IsoTypes.OrganizationStatus.Archived) {
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

    function _requireNonEmptyBatch(uint256 inputCount) internal pure {
        if (inputCount == 0) {
            revert EmptyBatch();
        }
    }

    function _writePolicyRule(
        IsoTypes.PolicyRule storage rule,
        uint64 orgId,
        IsoTypes.ProposalType proposalType,
        uint64 version,
        uint64[] calldata requiredApprovalBodies,
        uint64[] calldata vetoBodies,
        uint64 executorBody,
        uint64 timelockSeconds,
        bool enabled
    ) internal {
        delete rule.requiredApprovalBodies;
        delete rule.vetoBodies;
        rule.orgId = orgId;
        rule.proposalType = proposalType;
        rule.version = version;
        rule.executorBody = executorBody;
        rule.timelockSeconds = timelockSeconds;
        rule.enabled = enabled;
        _writeUint64Array(rule.requiredApprovalBodies, requiredApprovalBodies);
        _writeUint64Array(rule.vetoBodies, vetoBodies);
    }

    function _copyPolicyRule(IsoTypes.PolicyRule storage storedRule) internal view returns (IsoTypes.PolicyRule memory rule) {
        rule.orgId = storedRule.orgId;
        rule.proposalType = storedRule.proposalType;
        rule.version = storedRule.version;
        rule.requiredApprovalBodies = _copyUint64Array(storedRule.requiredApprovalBodies);
        rule.vetoBodies = _copyUint64Array(storedRule.vetoBodies);
        rule.executorBody = storedRule.executorBody;
        rule.timelockSeconds = storedRule.timelockSeconds;
        rule.enabled = storedRule.enabled;
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
