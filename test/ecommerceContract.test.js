const EcommerceContract = artifacts.require("EcommerceContract");

contract("EcommerceContract", (accounts) => {
  const [owner] = accounts;

  it("registers a product and stores full product details", async () => {
    const contract = await EcommerceContract.new({ from: owner });

    await contract.registerProduct({ from: owner });
    const count = await contract.getNoOfProducts();
    assert.equal(count.toString(), "1");

    const productId = "PRD003";
    const name = "Smart Phone Case";
    const category = "Accessories";
    const releaseDate = "2020-12-12";
    const description = "Clear purple case for iPhone 14 Pro Max";
    const priceCents = "7241";
    const stock = "100";
    const image = "case.png";

    await contract.addProductInfo(
      1,
      productId,
      name,
      category,
      releaseDate,
      description,
      priceCents,
      stock,
      image,
      { from: owner }
    );

    const info = await contract.getProductInfo(1);
    assert.equal(info.id, productId);
    assert.equal(info.name, name);
    assert.equal(info.category, category);
    assert.equal(info.releaseDate, releaseDate);
    assert.equal(info.description, description);
    assert.equal(info.price.toString(), priceCents);
    assert.equal(info.stock.toString(), stock);
    assert.equal(info.image, image);
    assert.equal(info.exists, true);
  });

  it("reverts when adding product info with an invalid productId", async () => {
    const contract = await EcommerceContract.new({ from: owner });

    try {
      await contract.addProductInfo(
        0,
        "PRD999",
        "Invalid",
        "Accessories",
        "2020-01-01",
        "Should fail",
        1000,
        10,
        "x.png",
        { from: owner }
      );
      assert.fail("Expected revert for invalid productId");
    } catch (e) {
      assert(
        e.message.includes("Invalid productId"),
        "Expected revert reason 'Invalid productId'"
      );
    }
  });

  it("intentionally fails to demonstrate a failing test", async () => {
    assert.equal(1, 2, "Intentional failure");
  });
});
