const express = require('express');
const { Web3 } = require('web3');
const fs = require("fs");
const path = require("path");
const EcommerceContract = require('./build/EcommerceContract.json');
const multer = require('multer');
const session = require('express-session');

const publicDir = path.join(__dirname, "public");
const imagesDir = path.join(publicDir, "images");
fs.mkdirSync(imagesDir, { recursive: true });

// ===== Multer =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imagesDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, unique + "-" + file.originalname);
  }
});
const upload = multer({ storage });

const app = express();
app.set('view engine', 'ejs');
app.use(express.static(publicDir));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(session({ secret: 'ecommerce-secret', resave: false, saveUninitialized: true }));

let GanacheWeb3;
let account = '';
let sellerAccount = '';
let listOfProductsSC = [];
let contractInfo;
let escrowInfo;

const productsDataPath = path.join(__dirname, "data", "products.json");
const ordersDataPath = path.join(__dirname, "data", "orders.json");

// ===== Helpers for Orders JSON =====
async function ensureOrdersFile() {
  try { await fs.promises.access(ordersDataPath); }
  catch {
    await fs.promises.mkdir(path.dirname(ordersDataPath), { recursive: true });
    await fs.promises.writeFile(ordersDataPath, JSON.stringify([], null, 2));
  }
}
async function readOrders() {
  await ensureOrdersFile();
  return JSON.parse(await fs.promises.readFile(ordersDataPath, "utf8"));
}
async function writeOrders(orders) {
  await fs.promises.mkdir(path.dirname(ordersDataPath), { recursive: true });
  await fs.promises.writeFile(ordersDataPath, JSON.stringify(orders, null, 2));
}

// ===== Helpers for Products JSON =====
async function ensureProductsFile() {
  try { await fs.promises.access(productsDataPath); }
  catch {
    await fs.promises.mkdir(path.dirname(productsDataPath), { recursive: true });
    await fs.promises.writeFile(productsDataPath, JSON.stringify([], null, 2));
  }
}
async function readProducts() {
  await ensureProductsFile();
  return JSON.parse(await fs.promises.readFile(productsDataPath, "utf8"));
}
async function writeProducts(products) {
  await fs.promises.mkdir(path.dirname(productsDataPath), { recursive: true });
  await fs.promises.writeFile(productsDataPath, JSON.stringify(products, null, 2));
}

// ===== Load Web3 + Contracts =====
let PaymentEscrow;
try {
  PaymentEscrow = require('./build/PaymentEscrow.json');
} catch {
  PaymentEscrow = require('../build/contracts/PaymentEscrow.json');
}

async function loadWeb3() {
  const host = process.env.WEB3_HOST || "127.0.0.1";
  const port = process.env.WEB3_PORT || "7545";
  const providerUrl = process.env.WEB3_PROVIDER || `http://${host}:${port}`;
  GanacheWeb3 = new Web3(providerUrl);
  try {
    await GanacheWeb3.eth.net.isListening();
  } catch (err) {
    throw new Error(
      `Web3 provider not reachable at ${providerUrl}. Start Ganache or set WEB3_PROVIDER. Original error: ${err.message}`
    );
  }
}

async function loadBlockchainData() {
  if (!GanacheWeb3) {
    throw new Error("Web3 not initialized. Call loadWeb3() first.");
  }
  const web3 = GanacheWeb3;
  const accounts = await web3.eth.getAccounts();
  account = accounts[0];
  sellerAccount = accounts[1];

  const networkId = await web3.eth.net.getId();

  const ecommerceNetwork = EcommerceContract.networks[networkId];
  if (!ecommerceNetwork) {
    throw new Error(`EcommerceContract not deployed on network ${networkId}. Run truffle migrate on the correct network.`);
  }
  contractInfo = new web3.eth.Contract(EcommerceContract.abi, ecommerceNetwork.address);

  const escrowNetwork = PaymentEscrow.networks[networkId];
  if (!escrowNetwork) {
    throw new Error(`PaymentEscrow not deployed on network ${networkId}. Run truffle migrate on the correct network.`);
  }
  escrowInfo = new web3.eth.Contract(PaymentEscrow.abi, escrowNetwork.address);
}

/* ================= ROUTES ================= */

// Home
const jsonProducts = require("./data/products.json");

app.get('/', async (req, res) => {
  await loadBlockchainData();

  const cnt = jsonProducts.length; 

  res.render('index', {
    acct: account,
    products: jsonProducts,
    status: false,
    cnt: cnt
  });
});

// Product detail
app.get('/product/:id', async (req, res) => {
  await loadBlockchainData();
  const product = jsonProducts.find(p => p.productId === req.params.id);
  if (!product) return res.status(404).send("Not found");

  res.render('productDetail', {
    acct: account,
    sellerAcct: sellerAccount,
    productData: product,
    contractAddress: escrowInfo.options.address
  });
});

// Add to cart
app.post('/addToCart/:productId', (req, res) => {
  const id = req.params.productId;
  if (!req.session.cart) req.session.cart = [];
  const p = jsonProducts.find(x => x.productId === id);
  if (p) {
    const existing = req.session.cart.find(i => i.productId === id);
    existing ? existing.quantity++ : req.session.cart.push({ ...p, quantity: 1 });
  }
  res.redirect('/cart');
});

// Cart
app.get('/cart', async (req, res) => {
  await loadBlockchainData();

  const cartItems = req.session.cart || [];
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const shippingFee = 10;
  const total = subtotal + shippingFee;

  // Loyalty logic 
  const expectedTokens = Math.floor(total / 10); // e.g. 1 token per $10 spent

  res.render('cart', {
    acct: account,
    cartItems,
    subtotal,
    shippingFee,
    total,
    expectedTokens   
  });
});

// Wallet & rewards
app.get('/wallet', async (req, res) => {
  const orders = await readOrders();
  const releasedOrders = orders.filter(o => o.status === "RELEASED");
  const totalSpent = releasedOrders.reduce((sum, o) => {
    const orderTotal = (o.items || []).reduce((s, item) => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      return s + price * qty;
    }, 0);
    return sum + orderTotal;
  }, 0);

  const totalEarned = Math.floor(totalSpent / 10);
  const totalRedeemed = 0;
  const tokenBalance = Math.max(0, totalEarned - totalRedeemed);

  const transactionHistory = releasedOrders.map(o => {
    const orderTotal = (o.items || []).reduce((s, item) => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      return s + price * qty;
    }, 0);
    const tokens = Math.floor(orderTotal / 10);
    return {
      type: "Earned",
      amount: tokens,
      date: new Date(o.releasedAt || o.createdAt || Date.now()).toLocaleDateString("en-US"),
      description: o.orderId
    };
  }).filter(tx => tx.amount > 0);

  const redeemOptions = [
    { name: "5% off next order", cost: 20 },
    { name: "Free shipping", cost: 15 },
    { name: "$10 voucher", cost: 40 }
  ];

  res.render('wallet', {
    tokenBalance,
    totalEarned,
    totalRedeemed,
    redeemOptions,
    transactionHistory
  });
});

// About
app.get('/about', (req, res) => {
  res.render('aboutUs');
});

// Add product
app.get('/addProduct', async (req, res) => {
  await loadBlockchainData();
  res.render('addProduct', { acct: account });
});

app.post('/addProduct', upload.single('image'), async (req, res) => {
  const { productId, name, description, price, stock, releaseDate, category } = req.body;
  if (!productId || !name || !description || !price || !stock || !releaseDate || !category) {
    return res.status(400).send("Missing required fields");
  }

  const imageName = req.file ? req.file.filename : null;
  if (!imageName) return res.status(400).send("Image upload required");

  await loadBlockchainData();

  const record = {
    productId,
    name,
    description,
    price: Number(price),
    stock: Number(stock),
    releaseDate,
    category,
    image: imageName
  };

  const products = await readProducts();
  const exists = products.find(p => p.productId === productId);
  if (exists) return res.status(409).send("Product ID already exists");

  // Write product data on-chain
  try {
    const gasRegister = await contractInfo.methods
      .registerProduct()
      .estimateGas({ from: account });
    const gasRegisterLimit = (gasRegister * 12n) / 10n;
    await contractInfo.methods.registerProduct().send({
      from: account,
      gas: gasRegisterLimit
    });

    const onChainId = await contractInfo.methods.getNoOfProducts().call();

    const gasAdd = await contractInfo.methods.addProductInfo(
      onChainId,
      productId,
      name,
      category,
      releaseDate
    ).estimateGas({ from: account });
    const gasAddLimit = (gasAdd * 12n) / 10n;
    await contractInfo.methods.addProductInfo(
      onChainId,
      productId,
      name,
      category,
      releaseDate
    ).send({
      from: account,
      gas: gasAddLimit
    });
    record.onChainId = Number(onChainId);
  } catch (err) {
    console.error("Blockchain write failed:", err.message || err);
    return res.status(500).send("Failed to write product to blockchain");
  }

  products.push(record);
  await writeProducts(products);
  jsonProducts.push(record);

  res.redirect('/');
});

// Delete product
app.post('/deleteProduct/:id', async (req, res) => {
  const id = req.params.id;

  const products = await readProducts();
  const target = products.find(p => p.productId === id);
  const next = products.filter(p => p.productId !== id);

  if (!target) return res.status(404).send("Product not found");

  await writeProducts(next);

  // Keep in-memory cache in sync
  const idx = jsonProducts.findIndex(p => p.productId === id);
  if (idx >= 0) jsonProducts.splice(idx, 1);

  // Best-effort cleanup of uploaded image file
  if (target.image) {
    const imageName = path.basename(target.image);
    const imagePath = path.join(imagesDir, imageName);
    fs.promises.unlink(imagePath).catch(() => {});
  }

  res.redirect('/');
});

// Checkout 
app.get('/checkout', async (req, res) => {
  await loadBlockchainData();

  const cartItems = req.session.cart || [];
  if (!cartItems.length) return res.redirect('/cart');

  const subtotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const shippingFee = 10;
  const total = subtotal + shippingFee;
  const orderId = `ORD-CART-${Date.now()}`;

  res.render('checkout', {
    acct: account,
    cartItems,
    subtotal,
    shippingFee,
    total,
    orderId,
    contractAddress: escrowInfo.options.address,
    sellerAcct: sellerAccount
  });
});

// ✅ Off-chain Order API (used by escrow-frontend.js)
app.post('/orders', async (req, res) => {
  try {
    const { orderId, items, buyerWallet, deliveryAddress, totalEth } = req.body;
    const finalId = orderId || `ORD-${Date.now()}`;

    const record = {
      orderId: finalId,
      items,
      buyerWallet,
      deliveryAddress,
      totalEth,
      status: "PAID_ESCROW",
      createdAt: new Date().toISOString()
    };

    const orders = await readOrders();
    orders.push(record);
    await writeOrders(orders);

    res.json({ orderId: finalId });
  } catch (err) {
    console.error("Create order failed:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Order Details
app.get('/orderDetails', async (req, res) => {
  const orderId = req.query.orderId;
  if (!orderId) return res.redirect('/');

  await loadBlockchainData();

  let escrowData = null;
  try {
    const o = await escrowInfo.methods.getOrder(orderId).call();
    escrowData = {
      orderId,
      buyer: o.buyer || o[0],
      seller: o.seller || o[1],
      amountWei: o.amountWei || o[2],
      status: o.status || o[3],
      createdAt: o.createdAt || o[4]
    };
  } catch (e) {
    escrowData = { orderId, error: "Order not found on chain" };
  }

  res.render('orderDetails', {
    acct: account,
    escrowData,
    contractAddress: escrowInfo.options.address
  });
});

app.get("/trackDelivery", async (req, res) => {
  const orderId = req.query.orderId;
  if (!orderId) return res.redirect("/");

  await loadBlockchainData();

  // Pull escrow state (FundsLocked / Released / Refunded)
  let escrowData = null;
  try {
    const o = await escrowInfo.methods.getOrder(orderId).call();
    escrowData = {
      orderId,
      buyer: o.buyer || o[0],
      seller: o.seller || o[1],
      amountWei: o.amountWei || o[2],
      status: Number(o.status ?? o[3]),
      createdAt: o.createdAt || o[4],
    };
  } catch (e) {
    escrowData = { orderId, error: "Order not found on chain" };
  }

  // Placeholder delivery timeline (until teammate implements real tracking)
  const deliveryStatus = {
    trackingId: `TRK-${orderId.slice(-6)}`,
    carrier: "DemoExpress",
    lastUpdated: new Date().toISOString(),
    timeline: [
      { status: "Order placed", date: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
      { status: "Packed", date: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
      { status: "Out for delivery", date: new Date().toISOString() },
    ],
  };

  res.render("deliveryTracking", { acct: account, escrowData, deliveryStatus });
});

// Confirm delivery -> release escrow funds on-chain
app.post("/escrow/confirm", async (req, res, next) => {
  try {
    const { orderId, productId } = req.body;
    if (!orderId) return res.status(400).send("Missing orderId");

    await loadBlockchainData();
    const receipt = await escrowInfo.methods.confirmDelivery(orderId).send({ from: account });

    try {
      const orders = await readOrders();
      const idx = orders.findIndex(o => o.orderId === orderId);
      if (idx >= 0) {
        orders[idx].status = "RELEASED";
        orders[idx].txHash = receipt.transactionHash;
        orders[idx].releasedAt = new Date().toISOString();
        await writeOrders(orders);
      }
    } catch (err) {
      console.warn("Failed to update orders.json after escrow release:", err.message || err);
    }

    const fallback = productId
      ? `/product/${encodeURIComponent(productId)}`
      : `/orderDetails?orderId=${encodeURIComponent(orderId)}`;
    res.redirect(req.get("referer") || fallback);
  } catch (err) {
    next(err);
  }
});

// Basic error handler for async route errors.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(err.message || "Unexpected server error");
});

/* ===== Server Start ===== */
(async () => {
  try {
    await loadWeb3();
    await loadBlockchainData();
  } catch (err) {
    console.error(err.message || err);
  }
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
})();
