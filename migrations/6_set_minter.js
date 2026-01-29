const LoyaltyToken = artifacts.require("LoyaltyToken");
const PaymentEscrow = artifacts.require("PaymentEscrow");

module.exports = async function (deployer, network, accounts) {
  const token = await LoyaltyToken.deployed();
  const escrow = await PaymentEscrow.deployed();

  await token.setMinter(escrow.address, { from: accounts[0] });
};
