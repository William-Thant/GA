const PaymentEscrow = artifacts.require("PaymentEscrow");

contract("PaymentEscrow", (accounts) => {
  const [buyer, seller, other] = accounts;

  it("locks funds when buyer creates an order", async () => {
    const escrow = await PaymentEscrow.new();
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
    const escrow = await PaymentEscrow.new();
    await escrow.createOrder("ORD-2", seller, { from: buyer, value: 1000 });

    try {
      await escrow.createOrder("ORD-2", seller, { from: buyer, value: 1000 });
      assert.fail("Expected revert");
    } catch (e) {
      assert(e.message.includes("Order exists"));
    }
  });

  it("only buyer can confirm delivery (interim)", async () => {
    const escrow = await PaymentEscrow.new();
    await escrow.createOrder("ORD-3", seller, { from: buyer, value: 1000 });

    try {
      await escrow.confirmDelivery("ORD-3", { from: other });
      assert.fail("Expected revert");
    } catch (e) {
      assert(e.message.includes("Only buyer"));
    }
  });

  it("releases funds to seller on delivery confirmation", async () => {
    const escrow = await PaymentEscrow.new();
    await escrow.createOrder("ORD-4", seller, {
      from: buyer,
      value: web3.utils.toWei("0.5", "ether"),
    });

    const balBefore = BigInt(await web3.eth.getBalance(seller));
    await escrow.confirmDelivery("ORD-4", { from: buyer });
    const balAfter = BigInt(await web3.eth.getBalance(seller));

    assert(balAfter > balBefore, "seller should receive funds");
    const o = await escrow.getOrder("ORD-4");
    assert.equal(o.status.toString(), "2", "status should be Released");
  });

  it("refunds buyer before delivery confirmation", async () => {
    const escrow = await PaymentEscrow.new();
    await escrow.createOrder("ORD-5", seller, { from: buyer, value: 2000 });

    await escrow.refund("ORD-5", { from: buyer });
    const o = await escrow.getOrder("ORD-5");
    assert.equal(o.status.toString(), "3", "status should be Refunded");
  });
});
