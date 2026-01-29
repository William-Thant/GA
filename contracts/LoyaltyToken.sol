// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Lin Yuhan
Student ID: 24023516
Class: C003-03
Date created: 28/01/2026
*/

contract LoyaltyToken {
    string public name = "Ecomme Rewards";
    string public symbol = "ECOM";
    uint8 public decimals = 18;

    uint256 public totalSupply;

    address public owner;
    address public minter; // PaymentEscrow will become minter

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed tokenOwner, address indexed spender, uint256 value);
    event MinterUpdated(address indexed newMinter);

    constructor() {
        owner = msg.sender;
        minter = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyMinter() {
        require(msg.sender == minter, "Not minter");
        _;
    }

    function setMinter(address _minter) external onlyOwner {
        require(_minter != address(0), "Bad minter");
        minter = _minter;
        emit MinterUpdated(_minter);
    }

    function mint(address to, uint256 amount) external onlyMinter {
        require(to != address(0), "Bad to");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient");
        require(allowance[from][msg.sender] >= amount, "Not allowed");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}