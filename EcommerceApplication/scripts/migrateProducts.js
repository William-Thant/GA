/* eslint-disable no-console */
// One-time migration: push local products.json to EcommerceContract on-chain.
const fs = require('fs');
const path = require('path');
const { Web3 } = require('web3');

const providerUrl = process.env.WEB3_PROVIDER || 'http://127.0.0.1:7545';
const web3 = new Web3(providerUrl);

const contractJson = require('../build/EcommerceContract.json');
const productsPath = path.join(__dirname, '..', 'data', 'products.json');

async function main() {
  const accounts = await web3.eth.getAccounts();
  const from = accounts[0];
  const netId = await web3.eth.net.getId();
  const deployed = contractJson.networks[netId];
  if (!deployed) {
    throw new Error(`EcommerceContract not deployed on network ${netId}. Run truffle migrate --reset.`);
  }
  const contract = new web3.eth.Contract(contractJson.abi, deployed.address);

  const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
  console.log(`Migrating ${products.length} products...`);

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const onchainId = p.productId || `PRD-${Date.now()}-${i}`;

    console.log(`→ [${i + 1}/${products.length}] ${onchainId} ${p.name}`);

    // registerProduct increments and returns product index implicitly
    await contract.methods.registerProduct().send({ from, gas: 500000 });
    const idx = await contract.methods.getNoOfProducts().call();

    // add full info (matches updated contract signature)
    await contract.methods.addProductInfo(
      idx,
      onchainId,
      p.name || '',
      p.category || '',
      p.releaseDate || '',
      p.description || '',
      Math.trunc(Number(p.price) || 0),
      Math.trunc(Number(p.stock) || 0),
      p.image || ''
    ).send({ from, gas: 700000 });
  }

  console.log('Migration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message || err);
  process.exit(1);
});
