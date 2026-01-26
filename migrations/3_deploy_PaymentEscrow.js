const PaymentEscrow = artifacts.require("PaymentEscrow");

module.exports = function (deployer) {
  deployer.deploy(PaymentEscrow);
};
