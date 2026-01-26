// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Mizyana Binte Mansoor Ali
Student ID: 24030289
Class: C003-03
Date created: 23/01/2026
*/

contract PaymentEscrow {
    address public owner;
    mapping(address => bool) public staff;

    enum OrderStatus {
        None,        // 0
        FundsLocked, // 1
        Released,    // 2
        Refunded     // 3
    }

    struct Order {
        address buyer;
        address seller;
        uint256 amountWei;
        OrderStatus status;
        uint256 createdAt;
    }

    mapping(bytes32 => Order) private orders;

    event OrderCreated(bytes32 indexed orderHash, string orderId, address indexed buyer, address indexed seller, uint256 amountWei);
    event PaymentReleased(bytes32 indexed orderHash, string orderId, address indexed seller, uint256 amountWei);
    event Refunded(bytes32 indexed orderHash, string orderId, address indexed buyer, uint256 amountWei);
    event StaffUpdated(address indexed staffAddress, bool allowed);

    bool private locked;
    modifier nonReentrant() {
        require(!locked, "Reentrancy blocked");
        locked = true;
        _;
        locked = false;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyStaff() {
        require(staff[msg.sender], "Only staff");
        _;
    }

    constructor() {
        owner = msg.sender;
        staff[msg.sender] = true;
    }

    function _hash(string memory orderId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(orderId));
    }

    // Buyer locks funds into escrow (contract holds ETH)
    function createOrder(string calldata orderId, address seller) external payable {
        require(seller != address(0), "Invalid seller");
        require(msg.value > 0, "Payment required");

        bytes32 orderHash = _hash(orderId);
        require(orders[orderHash].status == OrderStatus.None, "Order exists");

        orders[orderHash] = Order({
            buyer: msg.sender,
            seller: seller,
            amountWei: msg.value,
            status: OrderStatus.FundsLocked,
            createdAt: block.timestamp
        });

        emit OrderCreated(orderHash, orderId, msg.sender, seller, msg.value);
    }

    // Delivery confirmed by staff -> release funds to seller
    function confirmDelivery(string calldata orderId) external nonReentrant onlyStaff {
        bytes32 orderHash = _hash(orderId);
        Order storage o = orders[orderHash];

        require(o.status == OrderStatus.FundsLocked, "Not in escrow");

        o.status = OrderStatus.Released;
        (bool ok, ) = o.seller.call{value: o.amountWei}("");
        require(ok, "Transfer failed");

        emit PaymentReleased(orderHash, orderId, o.seller, o.amountWei);
    }

    // Optional: refund before delivery confirmation
    function refund(string calldata orderId) external nonReentrant {
        bytes32 orderHash = _hash(orderId);
        Order storage o = orders[orderHash];

        require(o.status == OrderStatus.FundsLocked, "Refund not allowed");
        require(msg.sender == o.buyer, "Only buyer");

        o.status = OrderStatus.Refunded;
        (bool ok, ) = o.buyer.call{value: o.amountWei}("");
        require(ok, "Refund failed");

        emit Refunded(orderHash, orderId, o.buyer, o.amountWei);
    }

    function setStaff(address staffAddress, bool allowed) external onlyOwner {
        require(staffAddress != address(0), "Invalid staff");
        staff[staffAddress] = allowed;
        emit StaffUpdated(staffAddress, allowed);
    }

    // Read order state for UI
    function getOrder(string calldata orderId)
        external
        view
        returns (address buyer, address seller, uint256 amountWei, uint8 status, uint256 createdAt)
    {
        bytes32 orderHash = _hash(orderId);
        Order memory o = orders[orderHash];
        return (o.buyer, o.seller, o.amountWei, uint8(o.status), o.createdAt);
    }
}
