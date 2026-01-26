(() => {
  const ABI = [
    "function confirmDelivery(string orderId)"
  ];

  const container = document.querySelector("[data-admin-escrow]");
  if (!container) return;

  const walletStatusEl = container.querySelector("[data-wallet-status]");
  const walletAddressEl = container.querySelector("[data-wallet-address]");
  const connectBtn = container.querySelector("[data-connect-wallet]");
  const statusEl = container.querySelector("[data-admin-status]");
  const escrowAddress = container.dataset.escrowAddress;

  let connectedAccount = null;

  const setText = (el, value) => {
    if (el) el.textContent = value;
  };

  const formatAddress = (addr) => {
    if (!addr || addr.length < 10) return addr || "-";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setText(walletStatusEl, "MetaMask not detected");
      return null;
    }
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    connectedAccount = accounts && accounts.length ? accounts[0] : null;
    setText(walletStatusEl, connectedAccount ? "Connected" : "Not connected");
    setText(walletAddressEl, formatAddress(connectedAccount));
    return connectedAccount;
  };

  const confirmDelivery = async (orderId) => {
    if (!window.ethereum || !window.ethers) {
      throw new Error("MetaMask not available");
    }
    if (!escrowAddress) throw new Error("Missing escrow contract address");

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(escrowAddress, ABI, signer);
    return contract.confirmDelivery(orderId);
  };

  const updateOffchainStatus = async (orderId, txHash) => {
    const response = await fetch(`/admin/orders/${orderId}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ status: "RELEASED", txHash })
    });
    if (!response.ok) {
      throw new Error(`Failed to update order (${response.status})`);
    }
  };

  const wireConfirmButtons = () => {
    const buttons = document.querySelectorAll("[data-confirm-delivery]");
    buttons.forEach(btn => {
      btn.addEventListener("click", async () => {
        setText(statusEl, "");
        try {
          const orderId = btn.dataset.orderId;
          if (!orderId) throw new Error("Missing order id");

          const account = connectedAccount || (await connectWallet());
          if (!account) throw new Error("Wallet not connected");

          setText(statusEl, "Waiting for MetaMask confirmation...");
          const tx = await confirmDelivery(orderId);
          setText(statusEl, `Transaction sent: ${tx.hash}`);

          await tx.wait();
          setText(statusEl, "Delivery confirmed on-chain. Updating off-chain status...");

          await updateOffchainStatus(orderId, tx.hash);
          setText(statusEl, "Order updated. Refreshing...");
          window.location.reload();
        } catch (err) {
          setText(statusEl, err.message || "Confirm delivery failed");
        }
      });
    });
  };

  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      connectWallet().catch(() => {
        setText(walletStatusEl, "Wallet connection failed");
      });
    });
  }

  wireConfirmButtons();
})();
