// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract EcommerceContract {
    enum ProductStatus {Sold, Available}
    
    string public marketplaceName;
    uint productCount;

    // Constructor code is only run when the contract is created
    constructor() {
        productCount = 0;
        marketplaceName = "Ecomme Marketplace";
    }

    function getMarketplaceName() public view returns(string memory){
        return marketplaceName;
    }

    struct CustomerRecord {
        string customerId;
        string customerName;
        string purchaseDate;
        string phone;
        string email;  
    }

    struct QualityCheckRecord {
        string inspectionName;
        string inspectionDate;
        string inspectorName;
        string facilityName;
        string phone;
        string email;
    }

    struct PurchaseAgreement {
        string orderId;
        string customerName;
        string purchaseDate;
        string returnPolicy;
        uint256 purchaseTotal;
    }
  
    struct WarrantyData {
        string warrantyId;
        string provider;
        string coverageType;
        uint256 maxClaimAmount;
        uint256 premium;
        string claimId;
        uint256 amountClaimed;
        string claimDate;
        string status;
    }

    struct MarketingRecord {
        string campaignType;
        string managerName;
        string channel;
        string phone;
        string campaignDate;
        string progress;
    }

    struct SupplierWarehouseRecords {
        string supplierName;
        string warehouseAddress;
        string supplierId;
        string phone;
        string email;       
    }

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
        SupplierWarehouseRecords supplierWarehouseRecords;
        PurchaseAgreement purchaseAgreement;
        WarrantyData warrantyData;
        CustomerRecord[] customerRecords;
        QualityCheckRecord[] qualityCheckHistory;
        MarketingRecord[] marketingHistory;
    }
    mapping(uint256 => Product) public products;
 
    function registerProduct() public returns (uint256) {
        productCount++;
    
        return productCount;
    }
    
    // Function to add product information
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
        products[productId].id = _id;
        products[productId].name = _name;
        products[productId].category = _category;
        products[productId].releaseDate = _releaseDate;
        products[productId].description = _description;
        products[productId].price = _price;
        products[productId].stock = _stock;
        products[productId].image = _image;
        products[productId].exists = true;
    }

    // Function to add supplier and warehouse information
    function addSupplierWarehouseInfo(uint256 productId, 
        string memory _supplierName,
        string memory _warehouseAddress,
        string memory _supplierId,
        string memory _phone,
        string memory _email ) public {
            products[productId].supplierWarehouseRecords = SupplierWarehouseRecords(_supplierName, _warehouseAddress, _supplierId,
            _phone, _email);

    }
   
    // Function to add purchase agreement 
    function addPurchaseAgreement (uint256 productId, 
        string memory _orderId,
        string memory _customerName,
        string memory _purchaseDate,
        string memory _returnPolicy,
        uint256 _purchaseTotal) public {
            products[productId].purchaseAgreement = PurchaseAgreement(_orderId, _customerName, _purchaseDate,
            _returnPolicy, _purchaseTotal);

    }

    // Function to add warranty data 
    function addWarrantyData (uint256 productId, 
       string memory _warrantyId,
        string memory _provider,
        string memory _coverageType,
        uint256 _maxClaimAmount,
        uint256 _premium,
        string memory _claimId,
        uint256 _amountClaimed,
        string memory _claimDate,
        string memory _status) public {
            products[productId].warrantyData = WarrantyData(_warrantyId, _provider, _coverageType,
             _maxClaimAmount, _premium, _claimId, _amountClaimed, _claimDate, _status);

    }
      
    // Function to add a new customer record
    function addCustomerRecord (uint256 productId, 
        string memory _customerId,
        string memory _customerName,
        string memory _purchaseDate,
        string memory _phone,
        string memory _email ) public {
            products[productId].customerRecords.push(CustomerRecord(_customerId, _customerName, _purchaseDate, _phone, _email));
    }

    function addQualityCheckRecord (uint256 productId, 
        string memory _inspectionName,
        string memory _inspectionDate,
        string memory _inspectorName,
        string memory _facilityName,
        string memory _phone,
        string memory _email) public {
            products[productId].qualityCheckHistory.push(QualityCheckRecord(_inspectionName, _inspectionDate, _inspectorName, _facilityName, _phone, _email));
    }

    function addMarketingRecord (uint256 productId, 
         string memory _campaignType,
        string memory _managerName,
        string memory _channel,
        string memory _phone,
        string memory _campaignDate,
        string memory _progress) public {
            products[productId].marketingHistory.push(MarketingRecord(_campaignType, _managerName, _channel, _phone,
        _campaignDate, _progress));

    }

    //Write a function getNoOfProducts to obtain the productCount
    function getNoOfProducts() public view returns (uint) {
        return productCount;
    }

     // Function to retrieve product information
    function getProductInfo(uint256 productId) public view returns (
        string memory id,
        string memory name,
        string memory category,
        string memory releaseDate,
        string memory description,
        uint256 price,
        uint256 stock,
        string memory image,
        bool exists
    ) {
        Product storage p = products[productId];
        return (p.id, p.name, p.category, p.releaseDate, p.description, p.price, p.stock, p.image, p.exists);
    }

     // Function to retrieve supplier warehouse information
    function getSupplierWarehouseInfo(uint256 productId) public view returns (SupplierWarehouseRecords memory) {
        return products[productId].supplierWarehouseRecords;
    }

    // Function to retrieve customer records
    function getCustomerRecords(uint256 productId) public view returns (CustomerRecord[] memory) {
        return products[productId].customerRecords;
    }

    // Function to retrieve quality check records
    function getQualityCheckRecords(uint256 productId) public view returns (QualityCheckRecord[] memory) {
        return products[productId].qualityCheckHistory;
    }

    // Function to retrieve marketing records
    function getMarketingRecords(uint256 productId) public view returns (MarketingRecord[] memory) {
        return products[productId].marketingHistory;
    }

    // Function to retrieve warranty data
    function getWarrantyData(uint256 productId) public view returns (WarrantyData memory) {
        return products[productId].warrantyData;
    }

    // Function to retrieve purchase agreement details
    function getPurchaseAgreement(uint256 productId) public view returns (PurchaseAgreement memory) {
        return products[productId].purchaseAgreement;
    }

}
