(() => {
  const ESCROW_ABI = [
    "function createOrder(string orderId, address seller) payable"
  ];

  const containers = document.querySelectorAll("[data-escrow]");
  if (!containers.length) return;

  const setText = (el, value) => el && (el.textContent = value);

  const formatAddress = (addr) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "-";

  const attach = (container) => {
    const statusEl = container.querySelector("[data-escrow-status]");
    const walletStatusEl = container.querySelector("[data-wallet-status]");
    const walletAddressEl = container.querySelector("[data-wallet-address]");
    const connectBtn = container.querySelector("[data-connect-wallet]");
    const submitBtn = container.querySelector("[data-escrow-submit]");

    let account = null;
    let busy = false;

    const connectWallet = async () => {
      const accs = await ethereum.request({ method: "eth_requestAccounts" });
      account = accs[0];
      setText(walletStatusEl, "Connected");
      setText(walletAddressEl, formatAddress(account));
      return account;
    };

    const handleSubmit = async () => {
      if (busy) return;
      busy = true;
      submitBtn.disabled = true;

      try {
        setText(statusEl, "Connecting wallet...");
        if (!account) await connectWallet();

        const ethAmount = container.dataset.ethAmount;
        const orderId = container.dataset.orderId || `ORD-${Date.now()}`;
        const deliveryField = document.getElementById("deliveryAddress");
        const deliveryAddress = deliveryField ? deliveryField.value : "";

        const payload = {
          orderId,
          items: JSON.parse(container.dataset.orderItems || "[]"),
          buyerWallet: account,
          totalEth: ethAmount,
          deliveryAddress
        };

        setText(statusEl, "Creating order...");
        const res = await fetch(container.dataset.orderEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        setText(statusEl, "Waiting for MetaMask...");
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(container.dataset.escrowAddress, ESCROW_ABI, signer);

        const tx = await contract.createOrder(data.orderId || orderId, container.dataset.sellerAddress, {
          value: ethers.parseEther(String(ethAmount))
        });

        setText(statusEl, `Tx sent: ${tx.hash}`);
        await tx.wait();

        setText(statusEl, "Payment locked. Redirecting...");
        window.location.href = `/orderDetails?orderId=${encodeURIComponent(data.orderId)}`;

      } catch (err) {
        setText(statusEl, err.message || "Payment failed");
        busy = false;
        submitBtn.disabled = false;
      }
    };

    connectBtn?.addEventListener("click", connectWallet);
    submitBtn?.addEventListener("click", handleSubmit);
  };

  containers.forEach(attach);
})();
