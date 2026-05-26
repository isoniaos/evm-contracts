// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {ZeroAddress, Unauthorized} from "../IsoErrors.sol";

contract IsoDemoVotesToken is ERC20, ERC20Permit, ERC20Votes {
    address public immutable owner;

    constructor(address ownerAddress) ERC20("Isonia Demo Votes", "ISO-DEMO") ERC20Permit("Isonia Demo Votes") {
        if (ownerAddress == address(0)) {
            revert ZeroAddress();
        }
        owner = ownerAddress;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != owner) {
            revert Unauthorized(msg.sender);
        }
        if (to == address(0)) {
            revert ZeroAddress();
        }
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._update(from, to, amount);
    }

    function nonces(address owner_) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner_);
    }
}
