const PaymentEscrow = artifacts.require("PaymentEscrow");
const LoyaltyToken = artifacts.require("LoyaltyToken");

contract("PaymentEscrow", (accounts) => {
  const [owner, buyer, seller, other] = accounts;

  const rewardRate = web3.utils.toWei("1000", "ether"); // 1000 tokens per 1 ETH

  let token;
  let escrow;

  beforeEach(async () => {
    token = await LoyaltyToken.new({ from: owner });
    escrow = await PaymentEscrow.new(token.address, rewardRate, { from: owner });

    // allow escrow to mint tokens
    await token.setMinter(escrow.address, { from: owner });

    // owner is staff by default in your escrow constructor
  });

  it("locks funds when buyer creates an order", async () => {
    await escrow.createOrder("ORD-1", seller, {
      from: buyer,
      value: web3.utils.toWei("1", "ether"),
    });

    const o = await escrow.getOrder("ORD-1");
    assert.equal(o.buyer, buyer, "buyer mismatch");
    assert.equal(o.seller, seller, "seller mismatch");
    assert.equal(o.status.toString(), "1", "status should be FundsLocked");
  });

  it("rejects duplicate orderId", async () => {
    await escrow.createOrder("ORD-2", seller, { from: buyer, value: 1000 });

    let reverted = false;
    try {
      await escrow.createOrder("ORD-2", seller, { from: buyer, value: 1000 });
    } catch (e) {
      reverted = true;
      assert(e.message.includes("Order exists"), "Expected 'Order exists'");
    }
    assert.equal(reverted, true, "Expected revert");
  });

  it("only staff can confirm delivery", async () => {
    await escrow.createOrder("ORD-3", seller, { from: buyer, value: 1000 });

    let reverted = false;
    try {
      await escrow.confirmDelivery("ORD-3", { from: other });
    } catch (e) {
      reverted = true;
      assert(e.message.includes("Only staff"), "Expected 'Only staff'");
    }
    assert.equal(reverted, true, "Expected revert");
  });

  it("releases funds to seller on delivery confirmation by staff", async () => {
    await escrow.createOrder("ORD-4", seller, {
      from: buyer,
      value: web3.utils.toWei("0.5", "ether"),
    });

    const balBefore = BigInt(await web3.eth.getBalance(seller));
    await escrow.confirmDelivery("ORD-4", { from: owner }); // owner is staff
    const balAfter = BigInt(await web3.eth.getBalance(seller));

    assert(balAfter > balBefore, "seller should receive funds");
    const o = await escrow.getOrder("ORD-4");
    assert.equal(o.status.toString(), "2", "status should be Released");
  });

  it("refunds buyer before delivery confirmation", async () => {
    await escrow.createOrder("ORD-5", seller, { from: buyer, value: 2000 });

    await escrow.refund("ORD-5", { from: buyer });
    const o = await escrow.getOrder("ORD-5");
    assert.equal(o.status.toString(), "3", "status should be Refunded");
  });
});
