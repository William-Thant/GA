const express = require('express');
const { Web3 } = require('web3');
const fs = require("fs");
const path = require("path");
let EcommerceContract;
try {
  EcommerceContract = require('../build/contracts/EcommerceContract.json');
} catch {
  EcommerceContract = require('./build/EcommerceContract.json');
}
let UserRegistry;
try {
  UserRegistry = require('../build/contracts/UserRegistry.json');
} catch {
  try {
    UserRegistry = require('./build/UserRegistry.json');
  } catch {
    UserRegistry = null;
  }
}
const multer = require('multer');
const session = require('express-session');
const crypto = require('crypto');

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
// expose user (prefer per-tab mapping) to all views
app.use((req, res, next) => {
  const tabId = req.query.tab || req.headers['x-tab-id'];
  req.tabId = tabId;
  const tabUser = tabId ? tabUsers.get(tabId) : null;
  res.locals.user = tabUser || req.session.user || null;
  res.locals.currentPath = req.path;
  const seg = req.path.split('/').filter(Boolean)[0] || '';
  res.locals.currentBase = '/' + seg;
  next();
});

let GanacheWeb3;
let account = '';
let sellerAccount = '';
let listOfProductsSC = [];
let contractInfo;
let escrowInfo;
let userRegistry;

const productsDataPath = path.join(__dirname, "data", "products.json");
const ordersDataPath = path.join(__dirname, "data", "orders.json");
const usersDataPath = path.join(__dirname, "data", "users.json");
const adminReqPath = path.join(__dirname, "data", "adminRequests.json");

// In-memory map for per-tab user state (tabId -> user object)
const tabUsers = new Map();

/* ===== Helpers for Products JSON (off-chain extras like image) ===== */
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
async function getLocalProductImage(productId) {
  if (!productId) return null;
  const products = await readProducts();
  const match = products.find(p => p.productId === productId);
  if (!match) return null;
  return match.catalog?.image || match.image || null;
}
function normalizeLocalProduct(local) {
  if (!local) return { catalog: {}, productInfo: {} };
  const catalog = local.catalog ? { ...local.catalog } : {
    name: local.name,
    description: local.description,
    price: local.price,
    stock: local.stock,
    image: local.image,
    category: local.category,
    releaseDate: local.releaseDate
  };
  const productInfo = local.productInfo ? { ...local.productInfo } : {
    id: local.productId,
    name: catalog.name,
    category: catalog.category,
    releaseDate: catalog.releaseDate
  };
  return { catalog, productInfo };
}
function normalizeChainProduct(chain) {
  if (!chain) return { catalog: {}, productInfo: {} };
  const catalog = chain.catalog ? { ...chain.catalog } : {
    name: chain.name,
    description: chain.description,
    price: chain.price,
    stock: chain.stock,
    image: chain.image,
    category: chain.category,
    releaseDate: chain.releaseDate
  };
  const productInfo = chain.productInfo ? { ...chain.productInfo } : {
    id: chain.productId || chain.id,
    name: catalog.name,
    category: catalog.category,
    releaseDate: catalog.releaseDate
  };
  return { catalog, productInfo };
}
function normalizeAddress(addr) {
  return (addr || "").toLowerCase();
}

/* ===== Helpers for Users JSON ===== */
async function ensureUsersFile() {
  try { await fs.promises.access(usersDataPath); }
  catch {
    await fs.promises.mkdir(path.dirname(usersDataPath), { recursive: true });
    await fs.promises.writeFile(usersDataPath, JSON.stringify([], null, 2));
  }
}
async function readUsers() {
  await ensureUsersFile();
  return JSON.parse(await fs.promises.readFile(usersDataPath, "utf8"));
}
async function writeUsers(users) {
  await fs.promises.mkdir(path.dirname(usersDataPath), { recursive: true });
  await fs.promises.writeFile(usersDataPath, JSON.stringify(users, null, 2));
}

async function ensureAdminReqFile() {
  try { await fs.promises.access(adminReqPath); }
  catch {
    await fs.promises.mkdir(path.dirname(adminReqPath), { recursive: true });
    await fs.promises.writeFile(adminReqPath, JSON.stringify([], null, 2));
  }
}
async function readAdminReq() {
  await ensureAdminReqFile();
  return JSON.parse(await fs.promises.readFile(adminReqPath, "utf8"));
}
async function writeAdminReq(reqs) {
  await fs.promises.mkdir(path.dirname(adminReqPath), { recursive: true });
  await fs.promises.writeFile(adminReqPath, JSON.stringify(reqs, null, 2));
}

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

// ===== Load Web3 + Contracts =====
let PaymentEscrow;
try {
  PaymentEscrow = require('../build/contracts/PaymentEscrow.json');
} catch {
  PaymentEscrow = require('./build/PaymentEscrow.json');
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

  if (UserRegistry && UserRegistry.networks && UserRegistry.networks[networkId]) {
    userRegistry = new web3.eth.Contract(UserRegistry.abi, UserRegistry.networks[networkId].address);
  } else {
    userRegistry = null;
  }
}

function isEmptyValue(value) {
  return value === undefined || value === null || value === "";
}
function isDifferentCatalog(localData, chainData) {
  const l = localData.catalog || {};
  const c = chainData.catalog || {};
  return (
    (l.name || "") !== (c.name || "") ||
    (l.category || "") !== (c.category || "") ||
    (l.releaseDate || "") !== (c.releaseDate || "") ||
    (l.description || "") !== (c.description || "") ||
    Number(l.price || 0) !== Number(c.price || 0) ||
    Number(l.stock || 0) !== Number(c.stock || 0) ||
    (l.image || "") !== (c.image || "")
  );
}
async function sendWithGas(method, from) {
  const gasEstimate = await method.estimateGas({ from });
  if (typeof gasEstimate === "bigint") {
    const gas = gasEstimate + (gasEstimate / 3n);
    return method.send({ from, gas });
  }
  const gas = Math.ceil(gasEstimate * 1.3);
  return method.send({ from, gas });
}

async function syncOrderStatusFromChain(orderId, escrowData, txHash = null) {
  if (!orderId || !escrowData) return;
  const statusNum = Number(escrowData.status ?? escrowData[3]);
  if (!Number.isFinite(statusNum)) return;

  let nextStatus = null;
  if (statusNum === 1) nextStatus = "PAID_ESCROW";
  if (statusNum === 2) nextStatus = "RELEASED";
  if (statusNum === 3) nextStatus = "REFUNDED";
  if (!nextStatus) return;

  try {
    const orders = await readOrders();
    const idx = orders.findIndex(o => o.orderId === orderId);
    if (idx < 0) return;
    orders[idx].status = nextStatus;
    if (nextStatus === "RELEASED") {
      if (txHash) orders[idx].txHash = orders[idx].txHash || txHash;
      orders[idx].releasedAt = orders[idx].releasedAt || new Date().toISOString();
    }
    if (nextStatus === "REFUNDED") {
      orders[idx].refundedAt = orders[idx].refundedAt || new Date().toISOString();
    }
    await writeOrders(orders);
  } catch (err) {
    console.warn("Failed to sync orders.json from on-chain status:", err.message || err);
  }
}

async function syncProductsToChain() {
  if (!contractInfo) return;
  const local = await readProducts();
  const onchain = await fetchProductsFromChain();
  const chainById = new Map(onchain.map(p => [p.productId, p]));
  let changed = false;

  // Pull chain -> local (fill missing and add new chain-only products)
  for (const cp of onchain) {
    if (!cp.productId) continue;
    const localIdx = local.findIndex(p => p.productId === cp.productId);
    const chainData = normalizeChainProduct(cp);
    if (localIdx === -1) {
      local.push({
        productId: cp.productId,
        catalog: chainData.catalog,
        productInfo: chainData.productInfo,
        onChainId: cp.chainIndex
      });
      changed = true;
      continue;
    }
    const lp = local[localIdx];
    const localData = normalizeLocalProduct(lp);
    const mergedCatalog = { ...localData.catalog };
    for (const key of Object.keys(chainData.catalog || {})) {
      if (isEmptyValue(mergedCatalog[key]) && !isEmptyValue(chainData.catalog[key])) {
        mergedCatalog[key] = chainData.catalog[key];
      }
    }
    const mergedInfo = { ...localData.productInfo };
    for (const key of Object.keys(chainData.productInfo || {})) {
      if (isEmptyValue(mergedInfo[key]) && !isEmptyValue(chainData.productInfo[key])) {
        mergedInfo[key] = chainData.productInfo[key];
      }
    }
    local[localIdx] = {
      ...lp,
      productId: lp.productId || cp.productId,
      catalog: mergedCatalog,
      productInfo: mergedInfo,
      onChainId: cp.chainIndex || lp.onChainId
    };
    changed = true;
  }

  if (changed) await writeProducts(local);

  for (const lp of local) {
    if (!lp.productId) continue;
    const data = normalizeLocalProduct(lp);
    const name = data.productInfo.name || data.catalog.name || "";
    const category = data.productInfo.category || data.catalog.category || "";
    const releaseDate = data.productInfo.releaseDate || data.catalog.releaseDate || "";
    if (!name) continue;
    const existing = chainById.get(lp.productId);
    if (!existing) {
      await sendWithGas(contractInfo.methods.registerProduct(), account);
      const newIndex = await contractInfo.methods.getNoOfProducts().call();
      await sendWithGas(contractInfo.methods.addProductInfo(
        newIndex,
        lp.productId,
        name,
        category,
        releaseDate,
        data.catalog.description || "",
        Math.round(Number(data.catalog.price) * 100) || 0,
        Number(data.catalog.stock) || 0,
        data.catalog.image || ""
      ), account);
      lp.onChainId = Number(newIndex);
      changed = true;
      continue;
    }

    const chainData = normalizeChainProduct(existing);
    if (isDifferentCatalog(data, chainData)) {
      await sendWithGas(contractInfo.methods.addProductInfo(
        existing.chainIndex,
        lp.productId,
        name,
        category,
        releaseDate,
        data.catalog.description || "",
        Math.round(Number(data.catalog.price) * 100) || 0,
        Number(data.catalog.stock) || 0,
        data.catalog.image || ""
      ), account);
      changed = true;
    }
  }

  if (changed) await writeProducts(local);
}

/* ================= ROUTES ================= */

async function fetchProductsFromChain() {
  const list = [];
  const total = await contractInfo.methods.getNoOfProducts().call();
  for (let i = 1; i <= total; i++) {
    const info = await contractInfo.methods.getProductInfo(i).call();
    const price = info.price !== undefined && info.price !== null && info.price !== ""
      ? Number(info.price) / 100
      : null;
    const stock = info.stock !== undefined && info.stock !== null && info.stock !== "" ? Number(info.stock) : null;
    list.push({
      chainIndex: i,
      productId: info.id,
      productInfo: {
        id: info.id,
        name: info.name,
        category: info.category,
        releaseDate: info.releaseDate
      },
      catalog: {
        name: info.name,
        description: info.description || null,
        price: Number.isFinite(price) ? price : null,
        stock: Number.isFinite(stock) ? stock : null,
        image: info.image || null,
        category: info.category,
        releaseDate: info.releaseDate
      }
    });
  }
  return list;
}

// Welcome page (landing)
app.get('/', (_req, res) => res.render('welcome'));
app.get('/welcome', (_req, res) => res.render('welcome'));

// Auth pages
app.get('/login', (req, res) => {
  res.render('login', { error: null, success: req.query.success || null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const users = await readUsers();
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).render('login', { error: 'Invalid credentials', success: null });
  const tabId = req.body.tab || req.query.tab || req.tabId || crypto.randomUUID();
  const userPayload = { email: user.email, role: user.role, name: user.name };
  req.session.user = userPayload;
  tabUsers.set(tabId, userPayload);
  res.redirect(`/home?tab=${tabId}`);
});

app.post('/logout', (req, res) => {
  const tabId = req.body.tab || req.query.tab || req.tabId;
  if (tabId) tabUsers.delete(tabId);
  req.session.destroy(() => res.redirect('/welcome'));
});

app.get('/register', (_req, res) => {
  res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
  const { name, email, password, phone, isAdmin } = req.body;
  const role = isAdmin ? 'admin' : 'customer';
  const users = await readUsers();
  if (users.some(u => u.email === email)) {
    return res.status(400).render('register', { error: 'Email already registered' });
  }

  // Admin request flow: create pending request for existing admins to approve
  if (role === 'admin') {
    const existingAdmins = users.filter(u => u.role === 'admin');
    if (existingAdmins.length === 0) {
      return res.status(403).render('register', { error: 'Admin request cannot be processed: no existing admin to review.' });
    }
    const reqs = await readAdminReq();
    reqs.push({ name, email, password, phone, createdAt: new Date().toISOString() });
    await writeAdminReq(reqs);
    return res.render('login', { error: null, success: 'Your admin request is pending approval. Please wait for an admin to accept, then log in.' });
  }

  // Customer flow
  users.push({ name, email, password, phone, role: 'customer' });
  await writeUsers(users);

  if (userRegistry) {
    try {
      await userRegistry.methods.upsertUser(
        name,
        email,
        phone,
        'customer'
      ).send({ from: account, gas: 300000 });
    } catch (err) {
      console.warn("On-chain user registry update failed:", err.message || err);
    }
  }

  res.render('login', { error: null, success: 'A new account has been successfully created. Please log in.' });
});

// ===== Admin requests review (admin only) =====
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send("Admin access required");
  }
  next();
}
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function blockAdminCart(req, res, next) {
  if (res.locals.user && res.locals.user.role === 'admin') {
    return res.status(403).send("Cart is not available for admin accounts.");
  }
  next();
}

app.get('/admin/requests', requireAdmin, async (req, res) => {
  const requests = await readAdminReq();
  res.render('adminRequests', { requests });
});

app.post('/admin/requests/:idx/approve', requireAdmin, async (req, res) => {
  const idx = Number(req.params.idx);
  const requests = await readAdminReq();
  if (idx < 0 || idx >= requests.length) return res.redirect('/admin/requests');
  const reqItem = requests[idx];

  const users = await readUsers();
  const existingIndex = users.findIndex(u => u.email === reqItem.email);
  if (existingIndex >= 0) {
    users[existingIndex] = { ...users[existingIndex], role: 'admin' };
  } else {
    users.push({ name: reqItem.name, email: reqItem.email, password: reqItem.password, phone: reqItem.phone, role: 'admin' });
  }
  await writeUsers(users);

  if (userRegistry) {
    try {
      await userRegistry.methods.upsertUser(
        reqItem.name,
        reqItem.email,
        reqItem.phone,
        'admin'
      ).send({ from: account, gas: 300000 });
    } catch (err) {
      console.warn("On-chain user registry update failed:", err.message || err);
    }
  }

  requests.splice(idx, 1);
  await writeAdminReq(requests);
  res.redirect('/admin/requests');
});

app.post('/admin/requests/:idx/reject', requireAdmin, async (req, res) => {
  const idx = Number(req.params.idx);
  const requests = await readAdminReq();
  if (idx < 0 || idx >= requests.length) return res.redirect('/admin/requests');
  requests.splice(idx, 1);
  await writeAdminReq(requests);
  res.redirect('/admin/requests');
});

async function renderProductGallery(req, res, showCartNav, hideHero = false) {
  let products = [];
  try {
    const chain = await fetchProductsFromChain();
    const local = await readProducts();
    const localById = new Map(local.map(p => [p.productId, p]));
    const merged = [];

    for (const p of chain) {
      if (!p.productId) continue;
      const match = localById.get(p.productId);
      if (match) {
        const localData = normalizeLocalProduct(match);
        p.productId = p.productId || match.productId;
        p.productInfo = { ...localData.productInfo, ...(p.productInfo || {}) };
        p.catalog = { ...localData.catalog, ...(p.catalog || {}) };
      }
      if (!p.catalog) p.catalog = {};
      if (!p.productInfo) p.productInfo = {};
      if (p.catalog.price !== undefined && p.catalog.price !== null && Number.isNaN(Number(p.catalog.price))) {
        p.catalog.price = null;
      }
      if (p.catalog.stock !== undefined && p.catalog.stock !== null && Number.isNaN(Number(p.catalog.stock))) {
        p.catalog.stock = null;
      }
      merged.push(p);
    }

    for (const lp of local) {
      if (!lp.productId) continue;
      if (merged.some(p => p.productId === lp.productId)) continue;
      const localData = normalizeLocalProduct(lp);
      merged.push({
        productId: lp.productId,
        productInfo: localData.productInfo,
        catalog: localData.catalog
      });
    }

    products = merged;
  } catch (err) {
    console.error("Failed to load products on-chain, fallback to local:", err.message);
    const local = await readProducts();
    products = local.map(lp => {
      const localData = normalizeLocalProduct(lp);
      return {
        productId: lp.productId,
        productInfo: localData.productInfo,
        catalog: localData.catalog
      };
    });
  }
  const cnt = products.length;
  let buyerOrders = [];
  let buyerWallet = null;
  if (res.locals.user && res.locals.user.role !== "admin") {
    buyerWallet = req.session.buyerWallet || null;
    if (buyerWallet) {
      const orders = await readOrders();
      buyerOrders = orders
        .filter(o => normalizeAddress(o.buyerWallet) === normalizeAddress(buyerWallet))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    }
  }
  res.render('index', {
    acct: account,
    products,
    status: false,       // status flag used for legacy loading state; keep false so grid shows
    hideHero,
    cnt,
    showCartNav,
    buyerOrders,
    buyerWallet
  });
}

// Home page (no Add to Cart nav)
app.get('/home', async (req, res) => {
  await loadBlockchainData();
  await renderProductGallery(req, res, false, false);
});

// Products gallery (with Add to Cart nav)
app.get('/products', async (req, res) => {
  await loadBlockchainData();
  // keep hero hidden? currently hides entire gallery because template wraps both in same block.
  await renderProductGallery(req, res, true, false);
});

// Product detail
app.get('/product/:id', async (req, res) => {
  await loadBlockchainData();
  let product = null;
  try {
    const products = await fetchProductsFromChain();
    product = products.find(p => p.productId === req.params.id);
  } catch (e) {
    const local = await readProducts();
    product = local.find(p => p.productId === req.params.id);
  }
  if (!product) {
    const local = await readProducts();
    product = local.find(p => p.productId === req.params.id);
  }
  if (!product) return res.status(404).send("Not found");
  const locals = await readProducts();
  const localMatch = locals.find(p => p.productId === (product.productId || product.id));
  if (localMatch) {
    const localData = normalizeLocalProduct(localMatch);
    product.productId = product.productId || localMatch.productId;
    product.productInfo = { ...localData.productInfo, ...(product.productInfo || {}) };
    product.catalog = { ...localData.catalog, ...(product.catalog || {}) };
  } else {
    const localData = normalizeLocalProduct(product);
    product.productInfo = { ...localData.productInfo, ...(product.productInfo || {}) };
    product.catalog = { ...localData.catalog, ...(product.catalog || {}) };
  }
  if (!product.catalog) product.catalog = {};
  if (!product.productInfo) product.productInfo = {};
  if (!product.catalog.image) {
    const localImage = await getLocalProductImage(product.productId || product.id);
    if (localImage) product.catalog.image = localImage;
  }

  res.render('productDetail', {
    acct: account,
    sellerAcct: sellerAccount,
    productData: product,
    contractAddress: escrowInfo.options.address
  });
});

// Edit product (form)
app.get('/editProduct/:id', requireAdmin, async (req, res) => {
  await loadBlockchainData();
  const id = req.params.id;
  let product = null;
  let chainIndex = null;

  try {
    const onchain = await fetchProductsFromChain();
    const found = onchain.find(p => p.productId === id);
    if (found) {
      product = found;
      chainIndex = found.chainIndex;
    }
  } catch (e) {
    // fall back to local
  }

  if (!product) {
    const local = await readProducts();
    product = local.find(p => p.productId === id);
  } else {
    const local = await readProducts();
    const match = local.find(p => p.productId === id);
    if (match) {
      product = {
        ...product,
        catalog: { ...product.catalog, ...match.catalog, image: match.catalog?.image || product.catalog?.image }
      };
    }
  }

  if (!product) return res.status(404).send("Product not found");
  if (!product.catalog || !product.productInfo) {
    const localData = normalizeLocalProduct(product);
    product = {
      ...product,
      catalog: { ...localData.catalog, ...(product.catalog || {}) },
      productInfo: { ...localData.productInfo, ...(product.productInfo || {}) }
    };
  }

  res.render('editProduct', { acct: account, product, chainIndex });
});
// Redirect accidental /editProduct or /editProduct/ to products
app.get(['/editProduct', '/editProduct/'], requireAdmin, (_req, res) => res.redirect('/products'));

// Edit product (submit)
app.post('/editProduct/:id', requireAdmin, upload.single('image'), async (req, res) => {
  await loadBlockchainData();
  const id = req.params.id;
  const { name, description, price, stock, category, releaseDate, chainIndex } = req.body;

  const products = await readProducts();
  const idx = products.findIndex(p => p.productId === id);
  if (idx < 0) return res.status(404).send("Product not found");

  const existing = products[idx];
  const oldImage = existing.catalog?.image || existing.image || "";
  const newImage = req.file ? req.file.filename : oldImage;

  const updatedCatalog = {
    ...existing.catalog,
    name,
    description,
    price: Number(price) || 0,
    stock: Number(stock) || 0,
    image: newImage,
    category,
    releaseDate
  };

  products[idx] = {
    ...existing,
    productId: id,
    catalog: updatedCatalog,
    productInfo: { ...(existing.productInfo || {}), id, name, category, releaseDate }
  };
  await writeProducts(products);

  const chainNum = Number(chainIndex);
  if (!Number.isNaN(chainNum) && chainNum > 0 && contractInfo) {
    try {
      await sendWithGas(contractInfo.methods.addProductInfo(
        chainNum,
        id,
        name,
        category,
        releaseDate,
        description,
        Math.round(Number(price) * 100) || 0,
        Number(stock) || 0,
        newImage
      ), account);
    } catch (err) {
      console.warn("On-chain edit failed (continuing with local changes):", err.message || err);
    }
  }

  res.redirect('/products');
});

// Add to cart
app.post('/addToCart/:productId', blockAdminCart, (req, res) => {
  const id = req.params.productId;
  if (!req.session.cart) req.session.cart = [];
  fetchProductsFromChain().then((all) => {
    const p = all.find(x => x.productId === id);
    if (p) {
      const existing = req.session.cart.find(i => i.productId === id);
      existing ? existing.quantity++ : req.session.cart.push({ ...p.catalog, productId: id, quantity: 1 });
    }
    res.redirect('/cart');
  }).catch(async () => {
    const local = await readProducts();
    const p = local.find(x => x.productId === id);
    if (p) {
      const existing = req.session.cart.find(i => i.productId === id);
      existing ? existing.quantity++ : req.session.cart.push({ ...p, quantity: 1 });
    }
    res.redirect('/cart');
  });
});

// Update cart quantity (+1 / -1)
app.post('/updateCart/:productId', blockAdminCart, (req, res) => {
  const id = req.params.productId;
  const delta = Number(req.body.delta || 0);
  if (!req.session.cart) req.session.cart = [];
  const item = req.session.cart.find(i => i.productId === id);
  if (item && Number.isFinite(delta)) {
    item.quantity = Math.max(1, (Number(item.quantity) || 1) + delta);
  }
  res.redirect('/cart');
});

// Remove item from cart
app.post('/removeFromCart/:productId', blockAdminCart, (req, res) => {
  const id = req.params.productId;
  if (!req.session.cart) req.session.cart = [];
  req.session.cart = req.session.cart.filter(i => i.productId !== id);
  res.redirect('/cart');
});

// Cart
app.get('/cart', blockAdminCart, async (req, res) => {
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

// Add Product (form)
app.get('/addProduct', requireAdmin, async (req, res) => {
  await loadBlockchainData();
  res.render('addProduct', { acct: account });
});

// Add Product (submit + on-chain write)
app.post('/addProduct', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    await loadBlockchainData();
    const { productId, name, description, price, stock, releaseDate, category } = req.body;
    const fileName = req.file ? req.file.filename : "";
    const onchainId = productId && productId.trim().length ? productId : `PRD-${Date.now()}`;

    // On-chain registration: numeric index then info with full fields
    await sendWithGas(contractInfo.methods.registerProduct(), account);
    const newIndex = await contractInfo.methods.getNoOfProducts().call();
    await sendWithGas(contractInfo.methods.addProductInfo(
      newIndex,
      onchainId,
      name,
      category,
      releaseDate,
      description,
      Math.round(Number(price) * 100) || 0,
      stock,
      fileName
    ), account);

    // Update local metadata mirror (for quick reads / images)
    const products = await readProducts();
    const catalog = {
      name,
      description,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
      image: fileName,
      category,
      releaseDate
    };
    const base = {
      productId: onchainId,
      catalog,
      productInfo: { id: onchainId, name, category, releaseDate }
    };
    const idx = products.findIndex(p => p.productId === onchainId);
    if (idx >= 0) {
      products[idx] = { ...products[idx], ...base, catalog: { ...products[idx].catalog, ...catalog } };
    } else {
      products.push(base);
    }
    await writeProducts(products);

    res.redirect('/products');
  } catch (err) {
    console.error("Add product failed:", err);
    res.status(500).send("Failed to add product: " + err.message);
  }
});

// Delete product
app.post('/deleteProduct/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;

  const products = await readProducts();
  const target = products.find(p => p.productId === id);
  const next = products.filter(p => p.productId !== id);

  if (!target) return res.status(404).send("Product not found");

  await writeProducts(next);

  // Best-effort cleanup of uploaded image file
  const imageName = target.catalog?.image || target.image;
  if (imageName) {
    const imagePath = path.join(imagesDir, path.basename(imageName));
    fs.promises.unlink(imagePath).catch(() => {});
  }

  res.redirect('/products');
});

// Checkout 
app.get('/checkout', blockAdminCart, async (req, res) => {
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
      deliveryStatus: "PENDING",
      deliveryUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    const orders = await readOrders();
    orders.push(record);
    await writeOrders(orders);
    if (buyerWallet) req.session.buyerWallet = buyerWallet;

    res.json({ orderId: finalId });
  } catch (err) {
    console.error("Create order failed:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Buyer orders (only their wallet)
app.get('/my-orders', requireLogin, async (req, res) => {
  const wallet = normalizeAddress(req.query.wallet || req.session.buyerWallet);
  const orders = await readOrders();
  const filtered = wallet
    ? orders.filter(o => normalizeAddress(o.buyerWallet) === wallet)
    : [];

  res.render('buyerOrders', {
    orders: filtered,
    buyerWallet: wallet || null
  });
});

// Buyer sets wallet for filtering orders
app.post('/my-orders/wallet', requireLogin, async (req, res) => {
  const wallet = normalizeAddress(req.body.wallet);
  if (!wallet || wallet.length < 6) {
    return res.redirect('/my-orders');
  }
  req.session.buyerWallet = wallet;
  res.redirect('/my-orders');
});

// Admin orders (all buyers)
app.get('/admin/orders', requireAdmin, async (req, res) => {
  await loadBlockchainData();
  const orders = await readOrders();
  const sorted = orders.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  res.render('adminOrders', {
    orders: sorted,
    contractAddress: escrowInfo?.options?.address || ''
  });
});

// Admin updates delivery status
app.post('/admin/orders/:orderId/delivery', requireAdmin, async (req, res) => {
  const orderId = req.params.orderId;
  const nextStatus = req.body.status;
  const allowed = new Set(["PENDING", "OUT_FOR_DELIVERY", "DELIVERED"]);
  if (!allowed.has(nextStatus)) {
    return res.status(400).send("Invalid delivery status");
  }
  const orders = await readOrders();
  const idx = orders.findIndex(o => o.orderId === orderId);
  if (idx >= 0) {
    orders[idx].deliveryStatus = nextStatus;
    orders[idx].deliveryUpdatedAt = new Date().toISOString();
    await writeOrders(orders);
  }
  res.redirect('/admin/orders');
});

// Admin updates payment/order status
app.post('/admin/orders/:orderId/status', requireAdmin, async (req, res) => {
  const orderId = req.params.orderId;
  const nextStatus = req.body.status;
  const allowed = new Set(["PAID_ESCROW", "SHIPPED", "DELIVERED", "RELEASED", "REFUNDED"]);
  if (!allowed.has(nextStatus)) {
    return res.status(400).send("Invalid status");
  }
  const orders = await readOrders();
  const idx = orders.findIndex(o => o.orderId === orderId);
  if (idx >= 0) {
    orders[idx].status = nextStatus;
    await writeOrders(orders);
  }
  res.redirect('/admin/orders');
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
    await syncOrderStatusFromChain(orderId, escrowData);
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
  const orders = await readOrders();
  const orderRecord = orders.find(o => o.orderId === orderId) || null;
  const sessionWallet = normalizeAddress(req.session.buyerWallet);
  if (req.session.user?.role !== "admin") {
    if (!sessionWallet || !orderRecord || normalizeAddress(orderRecord.buyerWallet) !== sessionWallet) {
      return res.status(403).send("Access denied");
    }
  }

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
    await syncOrderStatusFromChain(orderId, escrowData);
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

  res.render("deliveryTracking", { acct: account, escrowData, deliveryStatus, orderRecord });
});

// Debug: fetch escrow order by id
app.get("/escrow/order", async (req, res) => {
  const orderId = req.query.orderId;
  if (!orderId) return res.status(400).json({ error: "Missing orderId" });
  try {
    await loadBlockchainData();
    const o = await escrowInfo.methods.getOrder(orderId).call();
    const payload = {
      orderId,
      buyer: o.buyer || o[0],
      seller: o.seller || o[1],
      amountWei: o.amountWei || o[2],
      status: o.status || o[3],
      createdAt: o.createdAt || o[4]
    };
    return res.type("application/json").send(
      JSON.stringify(payload, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
    );
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// Confirm delivery -> release escrow funds on-chain
app.post("/escrow/confirm", async (req, res, next) => {
  try {
    const { orderId, productId } = req.body;
    if (!orderId) return res.status(400).send("Missing orderId");

    const orders = await readOrders();
    const orderRecord = orders.find(o => o.orderId === orderId);
    if (!orderRecord) return res.status(404).send("Order not found");
    if (orderRecord.deliveryStatus !== "OUT_FOR_DELIVERY") {
      return res.status(400).send("Delivery not confirmed by admin yet");
    }

    await loadBlockchainData();
    let escrowOrder;
    try {
      escrowOrder = await escrowInfo.methods.getOrder(orderId).call();
    } catch (err) {
      return res.status(404).send("Order not found on chain");
    }

    const status = Number(escrowOrder.status ?? escrowOrder[3]);
    if (status !== 1) {
      await syncOrderStatusFromChain(orderId, escrowOrder);

      const fallback = productId
        ? `/product/${encodeURIComponent(productId)}`
        : `/orderDetails?orderId=${encodeURIComponent(orderId)}`;
      return res.redirect(req.get("referer") || fallback);
    }

    let receipt;
    try {
      receipt = await sendWithGas(escrowInfo.methods.confirmDelivery(orderId), account);
    } catch (err) {
      // If it failed but the status already changed, sync and continue.
      try {
        const latest = await escrowInfo.methods.getOrder(orderId).call();
        const latestStatus = Number(latest.status ?? latest[3]);
        if (latestStatus !== 1) {
          await syncOrderStatusFromChain(orderId, latest);
          const fallback = productId
            ? `/product/${encodeURIComponent(productId)}`
            : `/orderDetails?orderId=${encodeURIComponent(orderId)}`;
          return res.redirect(req.get("referer") || fallback);
        }
      } catch (innerErr) {
        console.warn("Failed to re-check escrow status after confirm error:", innerErr.message || innerErr);
      }
      throw err;
    }

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
// Guard: block accidental GET to /escrow/confirm
app.get("/escrow/confirm", (_req, res) => {
  res.status(405).send("Use POST to confirm delivery.");
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
    await syncProductsToChain();
  } catch (err) {
    console.error(err.message || err);
  }
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
})();
