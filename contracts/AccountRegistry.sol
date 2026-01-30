// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * Simple registry to persist user account metadata and roles on‑chain.
 * Designed to be deployed alongside the ecommerce/escrow stack.
 */
contract AccountRegistry {
    enum Role {
        None,
        Buyer,
        Seller,
        Staff,
        Admin
    }

    struct Account {
        string userId;      // optional off-chain reference (email/uuid)
        string name;        // display name
        string metadata;    // arbitrary JSON/URI string for client use
        Role role;
        bool active;
        bool exists;
    }

    address public owner;
    mapping(address => Account) private accounts;

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event AccountRegistered(address indexed account, string userId, Role role, bool active);
    event AccountUpdated(address indexed account, string name, string metadata);
    event RoleChanged(address indexed account, Role role);
    event ActiveStatusChanged(address indexed account, bool active);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Bad owner");
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    function registerAccount(
        address account,
        string calldata userId,
        string calldata name,
        string calldata metadata,
        Role role,
        bool active
    ) external onlyOwner {
        require(account != address(0), "Bad account");
        accounts[account] = Account({
            userId: userId,
            name: name,
            metadata: metadata,
            role: role,
            active: active,
            exists: true
        });

        emit AccountRegistered(account, userId, role, active);
    }

    function updateProfile(
        address account,
        string calldata name,
        string calldata metadata
    ) external onlyOwner {
        require(accounts[account].exists, "Not registered");
        accounts[account].name = name;
        accounts[account].metadata = metadata;
        emit AccountUpdated(account, name, metadata);
    }

    function setRole(address account, Role role) external onlyOwner {
        require(accounts[account].exists, "Not registered");
        accounts[account].role = role;
        emit RoleChanged(account, role);
    }

    function setActive(address account, bool active) external onlyOwner {
        require(accounts[account].exists, "Not registered");
        accounts[account].active = active;
        emit ActiveStatusChanged(account, active);
    }

    function getAccount(address account)
        external
        view
        returns (
            string memory userId,
            string memory name,
            string memory metadata,
            Role role,
            bool active,
            bool exists
        )
    {
        Account storage a = accounts[account];
        return (a.userId, a.name, a.metadata, a.role, a.active, a.exists);
    }
}
