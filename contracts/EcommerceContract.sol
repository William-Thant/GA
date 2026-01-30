// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract EcommerceContract {
    string public marketplaceName;
    uint256 private productCount;

    struct Product {
        string id;
        string name;
        string description;
        uint256 price;
        uint256 stock;
        string releaseDate;
        string category;
        string image;
        bool exists;
    }

    mapping(uint256 => Product) private products;

    constructor() {
        marketplaceName = "Ecomme Marketplace";
    }

    function getNoOfProducts() public view returns (uint256) {
        return productCount;
    }

    function registerProduct() public returns (uint256) {
        productCount++;
        return productCount;
    }

    function addProductInfo(
        uint256 productId,
        string memory _id,
        string memory _name,
        string memory _category,
        string memory _releaseDate,
        string memory _description,
        uint256 _price,
        uint256 _stock,
        string memory _image
    ) public {
        require(productId > 0 && productId <= productCount, "Invalid productId");
        products[productId] = Product({
            id: _id,
            name: _name,
            description: _description,
            price: _price,
            stock: _stock,
            releaseDate: _releaseDate,
            category: _category,
            image: _image,
            exists: true
        });
    }

    function getProductInfo(uint256 productId)
        public
        view
        returns (
            string memory id,
            string memory name,
            string memory category,
            string memory releaseDate,
            string memory description,
            uint256 price,
            uint256 stock,
            string memory image,
            bool exists
        )
    {
        Product storage p = products[productId];
        return (p.id, p.name, p.category, p.releaseDate, p.description, p.price, p.stock, p.image, p.exists);
    }
}
