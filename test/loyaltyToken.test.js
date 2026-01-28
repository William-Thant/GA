const LoyaltyToken = artifacts.require("LoyaltyToken");

contract("LoyaltyToken", (accounts) => {
  const [owner, user, other] = accounts;

  it("allows owner to set minter", async () => {
    const token = await LoyaltyToken.new({ from: owner });
    await token.setMinter(user, { from: owner });
    const minter = await token.minter();
    assert.equal(minter, user);
  });

  it("prevents non-minter from minting tokens", async () => {
    const token = await LoyaltyToken.new({ from: owner });

    try {
      await token.mint(user, 1000, { from: other });
      assert.fail("Expected revert");
    } catch (e) {
      assert(e.message.includes("Not minter"));
    }
  });

  it("allows minter to mint tokens", async () => {
    const token = await LoyaltyToken.new({ from: owner });
    await token.setMinter(owner, { from: owner });

    await token.mint(user, 1000, { from: owner });
    const bal = await token.balanceOf(user);
    assert.equal(bal.toString(), "1000");
  });
});
