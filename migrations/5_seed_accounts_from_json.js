const fs = require("fs");
const path = require("path");
const AccountRegistry = artifacts.require("AccountRegistry");

module.exports = async function (deployer, network, accounts) {
  // Assumes AccountRegistry already deployed in previous migration.
  const registry = await AccountRegistry.deployed();

  // Load users from the off-chain JSON used by the Express app.
  const usersPath = path.join(__dirname, "..", "EcommerceApplication", "data", "users.json");
  const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));

  // Map string roles to AccountRegistry.Role enum values.
  const roleMap = {
    admin: 4, // Role.Admin
    customer: 1, // Role.Buyer
  };

  // Use available test accounts; deployer is owner (accounts[0]).
  for (let i = 0; i < users.length; i++) {
    const addr = accounts[i] || accounts[accounts.length - 1];
    const user = users[i];
    const role = roleMap[user.role] || 1;

    const metadata = JSON.stringify({ phone: user.phone });

    await registry.registerAccount(
      addr,
      user.email, // userId
      user.name,
      metadata,
      role,
      true,
      { from: accounts[0] }
    );
  }
};
