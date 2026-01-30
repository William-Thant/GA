const AccountRegistry = artifacts.require("AccountRegistry");

module.exports = async function (deployer) {
  await deployer.deploy(AccountRegistry);
};
