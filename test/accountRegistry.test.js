const AccountRegistry = artifacts.require("AccountRegistry");

contract("AccountRegistry", (accounts) => {
  const [owner, alice, bob] = accounts;
  let registry;

  beforeEach(async () => {
    registry = await AccountRegistry.new({ from: owner });
  });

  it("stores account details and role", async () => {
    await registry.registerAccount(
      alice,
      "user-1",
      "Alice",
      "{\"city\":\"SG\"}",
      1, // Role.Buyer
      true,
      { from: owner }
    );

    const res = await registry.getAccount(alice);

    assert.equal(res.userId, "user-1");
    assert.equal(res.name, "Alice");
    assert.equal(res.metadata, "{\"city\":\"SG\"}");
    assert.equal(res.role.toString(), "1"); // Buyer
    assert.equal(res.active, true);
    assert.equal(res.exists, true);
  });

  it("allows owner to change role and deactivate", async () => {
    await registry.registerAccount(
      bob,
      "user-2",
      "Bob",
      "",
      2, // Role.Seller
      true,
      { from: owner }
    );

    await registry.setRole(bob, 3, { from: owner }); // Role.Staff
    await registry.setActive(bob, false, { from: owner });

    const res = await registry.getAccount(bob);

    assert.equal(res.role.toString(), "3");
    assert.equal(res.active, false);
  });
});
