(() => {
  const ABI = [
    "function setStaff(address staffAddress, bool allowed)"
  ];

  const container = document.querySelector("[data-staff-admin]");
  if (!container) return;

  const escrowAddress = container.dataset.escrowAddress;
  const walletStatusEl = container.querySelector("[data-wallet-status]");
  const walletAddressEl = container.querySelector("[data-wallet-address]");
  const connectBtn = container.querySelector("[data-connect-wallet]");
  const statusEl = container.querySelector("[data-staff-status]");
  const form = container.querySelector("[data-staff-form]");
  const addressInput = document.getElementById("staffAddress");
  const actionSelect = document.getElementById("staffAction");

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

  const updateStaff = async (staffAddress, allowed) => {
    if (!window.ethereum || !window.ethers) {
      throw new Error("MetaMask not available");
    }
    if (!escrowAddress) throw new Error("Missing escrow contract address");

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(escrowAddress, ABI, signer);
    return contract.setStaff(staffAddress, allowed);
  };

  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      connectWallet().catch(() => {
        setText(walletStatusEl, "Wallet connection failed");
      });
    });
  }

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setText(statusEl, "");

      try {
        const staffAddress = addressInput.value.trim();
        if (!staffAddress) throw new Error("Enter a staff address");
        const allowed = actionSelect.value === "true";

        const account = connectedAccount || (await connectWallet());
        if (!account) throw new Error("Wallet not connected");

        setText(statusEl, "Waiting for MetaMask confirmation...");
        const tx = await updateStaff(staffAddress, allowed);
        setText(statusEl, `Transaction sent: ${tx.hash}`);
        await tx.wait();
        setText(statusEl, "Staff updated successfully.");
        addressInput.value = "";
      } catch (err) {
        setText(statusEl, err.message || "Failed to update staff");
      }
    });
  }
})();
