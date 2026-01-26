const EcommerceContract = artifacts.require("EcommerceContract");
module.exports = function(deployer){
    deployer.deploy(EcommerceContract);
};

