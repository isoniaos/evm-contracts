// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessManager} from "@openzeppelin/contracts/access/manager/AccessManager.sol";

contract IsoDemoAccessManager is AccessManager {
    constructor(address initialAdmin) AccessManager(initialAdmin) {}
}
