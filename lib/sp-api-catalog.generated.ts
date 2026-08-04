// Generated from SP-API_EndPoints_Catalog.md. Do not edit manually.
export type SpApiEndpoint = { id: string; name: string; method: string; path: string; category: string };
export const SP_API_ENDPOINTS: SpApiEndpoint[] = [
  {
    "id": "aContentManagement_searchContentDocuments",
    "name": "searchContentDocuments",
    "method": "GET",
    "path": "/aplus/2020-11-01/contentDocuments",
    "category": "A+ Content Management"
  },
  {
    "id": "aContentManagement_createContentDocument",
    "name": "createContentDocument",
    "method": "POST",
    "path": "/aplus/2020-11-01/contentDocuments",
    "category": "A+ Content Management"
  },
  {
    "id": "aContentManagement_getContentDocument",
    "name": "getContentDocument",
    "method": "GET",
    "path": "/aplus/2020-11-01/contentDocuments/{contentReferenceKey}",
    "category": "A+ Content Management"
  },
  {
    "id": "aContentManagement_updateContentDocument",
    "name": "updateContentDocument",
    "method": "POST",
    "path": "/aplus/2020-11-01/contentDocuments/{contentReferenceKey}",
    "category": "A+ Content Management"
  },
  {
    "id": "aContentManagement_listContentDocumentAsinRelations",
    "name": "listContentDocumentAsinRelations",
    "method": "GET",
    "path": "/aplus/2020-11-01/contentDocuments/{contentReferenceKey}/asins",
    "category": "A+ Content Management"
  },
  {
    "id": "aContentManagement_postContentDocumentAsinRelations",
    "name": "postContentDocumentAsinRelations",
    "method": "POST",
    "path": "/aplus/2020-11-01/contentDocuments/{contentReferenceKey}/asins",
    "category": "A+ Content Management"
  },
  {
    "id": "aContentManagement_validateContentDocumentAsinRelations",
    "name": "validateContentDocumentAsinRelations",
    "method": "POST",
    "path": "/aplus/2020-11-01/contentAsinValidations",
    "category": "A+ Content Management"
  },
  {
    "id": "aContentManagement_searchContentPublishRecords",
    "name": "searchContentPublishRecords",
    "method": "GET",
    "path": "/aplus/2020-11-01/contentPublishRecords",
    "category": "A+ Content Management"
  },
  {
    "id": "aContentManagement_postContentDocumentApprovalSubmission",
    "name": "postContentDocumentApprovalSubmission",
    "method": "POST",
    "path": "/aplus/2020-11-01/contentDocuments/{contentReferenceKey}/approvalSubmissions",
    "category": "A+ Content Management"
  },
  {
    "id": "aContentManagement_postContentDocumentSuspendSubmission",
    "name": "postContentDocumentSuspendSubmission",
    "method": "POST",
    "path": "/aplus/2020-11-01/contentDocuments/{contentReferenceKey}/suspendSubmissions",
    "category": "A+ Content Management"
  },
  {
    "id": "amazonExternalFulfillmentReturnItemProcessing_listReturns",
    "name": "listReturns",
    "method": "GET",
    "path": "/externalFulfillment/2024-09-11/returns",
    "category": "Amazon External Fulfillment Return Item Processing"
  },
  {
    "id": "amazonExternalFulfillmentReturnItemProcessing_getReturn",
    "name": "getReturn",
    "method": "GET",
    "path": "/externalFulfillment/2024-09-11/returns/{returnId}",
    "category": "Amazon External Fulfillment Return Item Processing"
  },
  {
    "id": "amazonExternalFulfillmentShipmentsProcessing_getShipments",
    "name": "getShipments",
    "method": "GET",
    "path": "/externalFulfillment/2024-09-11/shipments",
    "category": "Amazon External Fulfillment Shipments Processing"
  },
  {
    "id": "amazonExternalFulfillmentShipmentsProcessing_getShipment",
    "name": "getShipment",
    "method": "GET",
    "path": "/externalFulfillment/2024-09-11/shipments/{shipmentId}",
    "category": "Amazon External Fulfillment Shipments Processing"
  },
  {
    "id": "amazonExternalFulfillmentShipmentsProcessing_processShipment",
    "name": "processShipment",
    "method": "POST",
    "path": "/externalFulfillment/2024-09-11/shipments/{shipmentId}",
    "category": "Amazon External Fulfillment Shipments Processing"
  },
  {
    "id": "amazonExternalFulfillmentShipmentsProcessing_createPackages",
    "name": "createPackages",
    "method": "POST",
    "path": "/externalFulfillment/2024-09-11/shipments/{shipmentId}/packages",
    "category": "Amazon External Fulfillment Shipments Processing"
  },
  {
    "id": "amazonExternalFulfillmentShipmentsProcessing_updatePackage",
    "name": "updatePackage",
    "method": "PUT",
    "path": "/externalFulfillment/2024-09-11/shipments/{shipmentId}/packages/{packageId}",
    "category": "Amazon External Fulfillment Shipments Processing"
  },
  {
    "id": "amazonExternalFulfillmentShipmentsProcessing_updatePackageStatus",
    "name": "updatePackageStatus",
    "method": "PATCH",
    "path": "/externalFulfillment/2024-09-11/shipments/{shipmentId}/packages/{packageId}",
    "category": "Amazon External Fulfillment Shipments Processing"
  },
  {
    "id": "amazonExternalFulfillmentShipmentsProcessing_retrieveShippingOptions",
    "name": "retrieveShippingOptions",
    "method": "GET",
    "path": "/externalFulfillment/2024-09-11/shipments/{shipmentId}/shippingOptions",
    "category": "Amazon External Fulfillment Shipments Processing"
  },
  {
    "id": "amazonExternalFulfillmentShipmentsProcessing_retrieveInvoice",
    "name": "retrieveInvoice",
    "method": "GET",
    "path": "/externalFulfillment/2024-09-11/shipments/{shipmentId}/invoice",
    "category": "Amazon External Fulfillment Shipments Processing"
  },
  {
    "id": "amazonExternalFulfillmentShipmentsProcessing_generateInvoice",
    "name": "generateInvoice",
    "method": "POST",
    "path": "/externalFulfillment/2024-09-11/shipments/{shipmentId}/invoice",
    "category": "Amazon External Fulfillment Shipments Processing"
  },
  {
    "id": "amazonExternalFulfillmentShipmentsProcessing_generateShipLabels",
    "name": "generateShipLabels",
    "method": "PUT",
    "path": "/externalFulfillment/2024-09-11/shipments/{shipmentId}/shipLabels",
    "category": "Amazon External Fulfillment Shipments Processing"
  },
  {
    "id": "amazonSellerWalletOpenBankingApi_listAccounts",
    "name": "Get all Amazon Seller Wallet accounts",
    "method": "GET",
    "path": "/finances/transfers/wallet/2024-03-01/accounts",
    "category": "Amazon Seller Wallet Open Banking API"
  },
  {
    "id": "amazonSellerWalletOpenBankingApi_getAccount",
    "name": "Find particular account by ID",
    "method": "GET",
    "path": "/finances/transfers/wallet/2024-03-01/accounts/{accountId}",
    "category": "Amazon Seller Wallet Open Banking API"
  },
  {
    "id": "amazonSellerWalletOpenBankingApi_listAccountBalances",
    "name": "Find balance by account ID",
    "method": "GET",
    "path": "/finances/transfers/wallet/2024-03-01/accounts/{accountId}/balance",
    "category": "Amazon Seller Wallet Open Banking API"
  },
  {
    "id": "amazonSellerWalletOpenBankingApi_getTransferPreview",
    "name": "Fetch potential fees",
    "method": "GET",
    "path": "/finances/transfers/wallet/2024-03-01/transferPreview",
    "category": "Amazon Seller Wallet Open Banking API"
  },
  {
    "id": "amazonSellerWalletOpenBankingApi_listAccountTransactions",
    "name": "List all transactions",
    "method": "GET",
    "path": "/finances/transfers/wallet/2024-03-01/transactions",
    "category": "Amazon Seller Wallet Open Banking API"
  },
  {
    "id": "amazonSellerWalletOpenBankingApi_createTransaction",
    "name": "Create transaction request",
    "method": "POST",
    "path": "/finances/transfers/wallet/2024-03-01/transactions",
    "category": "Amazon Seller Wallet Open Banking API"
  },
  {
    "id": "amazonSellerWalletOpenBankingApi_getTransaction",
    "name": "Find transaction by ID",
    "method": "GET",
    "path": "/finances/transfers/wallet/2024-03-01/transactions/{transactionId}",
    "category": "Amazon Seller Wallet Open Banking API"
  },
  {
    "id": "amazonSellerWalletOpenBankingApi_listTransferSchedules",
    "name": "List transfer schedules",
    "method": "GET",
    "path": "/finances/transfers/wallet/2024-03-01/transferSchedules",
    "category": "Amazon Seller Wallet Open Banking API"
  },
  {
    "id": "amazonSellerWalletOpenBankingApi_createTransferSchedule",
    "name": "Create transfer schedule",
    "method": "POST",
    "path": "/finances/transfers/wallet/2024-03-01/transferSchedules",
    "category": "Amazon Seller Wallet Open Banking API"
  },
  {
    "id": "amazonSellerWalletOpenBankingApi_updateTransferSchedule",
    "name": "Update transfer schedule",
    "method": "PUT",
    "path": "/finances/transfers/wallet/2024-03-01/transferSchedules",
    "category": "Amazon Seller Wallet Open Banking API"
  },
  {
    "id": "amazonSellerWalletOpenBankingApi_getTransferSchedule",
    "name": "Find transfer schedule by ID",
    "method": "GET",
    "path": "/finances/transfers/wallet/2024-03-01/transferSchedules/{transferScheduleId}",
    "category": "Amazon Seller Wallet Open Banking API"
  },
  {
    "id": "amazonSellerWalletOpenBankingApi_deleteScheduleTransaction",
    "name": "Delete scheduled transaction",
    "method": "DELETE",
    "path": "/finances/transfers/wallet/2024-03-01/transferSchedules/{transferScheduleId}",
    "category": "Amazon Seller Wallet Open Banking API"
  },
  {
    "id": "amazonShippingApi_getRates",
    "name": "getRates",
    "method": "POST",
    "path": "/shipping/v2/shipments/rates",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_directPurchaseShipment",
    "name": "directPurchaseShipment",
    "method": "POST",
    "path": "/shipping/v2/shipments/directPurchase",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_purchaseShipment",
    "name": "purchaseShipment",
    "method": "POST",
    "path": "/shipping/v2/shipments",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_oneClickShipment",
    "name": "oneClickShipment",
    "method": "POST",
    "path": "/shipping/v2/oneClickShipment",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_getTracking",
    "name": "getTracking",
    "method": "GET",
    "path": "/shipping/v2/tracking",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_getShipmentDocuments",
    "name": "getShipmentDocuments",
    "method": "GET",
    "path": "/shipping/v2/shipments/{shipmentId}/documents",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_cancelShipment",
    "name": "cancelShipment",
    "method": "PUT",
    "path": "/shipping/v2/shipments/{shipmentId}/cancel",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_getAdditionalInputs",
    "name": "getAdditionalInputs",
    "method": "GET",
    "path": "/shipping/v2/shipments/additionalInputs/schema",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_getCarrierAccountFormInputs",
    "name": "getCarrierAccountFormInputs",
    "method": "GET",
    "path": "/shipping/v2/carrierAccountFormInputs",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_getCarrierAccounts",
    "name": "getCarrierAccounts",
    "method": "PUT",
    "path": "/shipping/v2/carrierAccounts",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_linkCarrierAccount",
    "name": "linkCarrierAccount",
    "method": "POST",
    "path": "/shipping/v2/carrierAccounts/{carrierId}",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_linkCarrierAccount",
    "name": "linkCarrierAccount",
    "method": "PUT",
    "path": "/shipping/v2/carrierAccounts/{carrierId}",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_unlinkCarrierAccount",
    "name": "unlinkCarrierAccount",
    "method": "PUT",
    "path": "/shipping/v2/carrierAccounts/{carrierId}/unlink",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_generateCollectionForm",
    "name": "generateCollectionForm",
    "method": "POST",
    "path": "/shipping/v2/collectionForms",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_getCollectionFormHistory",
    "name": "getCollectionFormHistory",
    "method": "PUT",
    "path": "/shipping/v2/collectionForms/history",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_getCollectionForm",
    "name": "getCollectionForm",
    "method": "GET",
    "path": "/shipping/v2/collectionForms/{collectionFormId}",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_getAccessPoints",
    "name": "getAccessPoints",
    "method": "GET",
    "path": "/shipping/v2/accessPoints",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_submitNdrFeedback",
    "name": "submitNdrFeedback",
    "method": "POST",
    "path": "/shipping/v2/ndrFeedback",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonShippingApi_createClaim",
    "name": "createClaim",
    "method": "POST",
    "path": "/shipping/v2/claims",
    "category": "Amazon Shipping API"
  },
  {
    "id": "amazonWarehousingAndDistribution_createInbound",
    "name": "createInbound",
    "method": "POST",
    "path": "/awd/2024-05-09/inboundOrders",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_getInbound",
    "name": "getInbound",
    "method": "GET",
    "path": "/awd/2024-05-09/inboundOrders/{orderId}",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_updateInbound",
    "name": "updateInbound",
    "method": "PUT",
    "path": "/awd/2024-05-09/inboundOrders/{orderId}",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_cancelInbound",
    "name": "cancelInbound",
    "method": "POST",
    "path": "/awd/2024-05-09/inboundOrders/{orderId}/cancellation",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_confirmInbound",
    "name": "confirmInbound",
    "method": "POST",
    "path": "/awd/2024-05-09/inboundOrders/{orderId}/confirmation",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_getInboundShipment",
    "name": "getInboundShipment",
    "method": "GET",
    "path": "/awd/2024-05-09/inboundShipments/{shipmentId}",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_getInboundShipmentLabels",
    "name": "getInboundShipmentLabels",
    "method": "GET",
    "path": "/awd/2024-05-09/inboundShipments/{shipmentId}/labels",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_updateInboundShipmentTransportDetails",
    "name": "updateInboundShipmentTransportDetails",
    "method": "PUT",
    "path": "/awd/2024-05-09/inboundShipments/{shipmentId}/transport",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_checkInboundEligibility",
    "name": "checkInboundEligibility",
    "method": "POST",
    "path": "/awd/2024-05-09/inboundEligibility",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_listInboundShipments",
    "name": "listInboundShipments",
    "method": "GET",
    "path": "/awd/2024-05-09/inboundShipments",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_listInventory",
    "name": "listInventory",
    "method": "GET",
    "path": "/awd/2024-05-09/inventory",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_listReplenishmentOrders",
    "name": "listReplenishmentOrders",
    "method": "GET",
    "path": "/awd/2024-05-09/replenishmentOrders",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_createReplenishmentOrder",
    "name": "createReplenishmentOrder",
    "method": "POST",
    "path": "/awd/2024-05-09/replenishmentOrders",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_getReplenishmentOrder",
    "name": "getReplenishmentOrder",
    "method": "GET",
    "path": "/awd/2024-05-09/replenishmentOrders/{orderId}",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "amazonWarehousingAndDistribution_confirmReplenishmentOrder",
    "name": "confirmReplenishmentOrder",
    "method": "POST",
    "path": "/awd/2024-05-09/replenishmentOrders/{orderId}/confirmation",
    "category": "Amazon Warehousing and Distribution"
  },
  {
    "id": "applicationManagement_rotateApplicationClientSecret",
    "name": "rotateApplicationClientSecret",
    "method": "POST",
    "path": "/applications/2023-11-30/clientSecret",
    "category": "Application Management"
  },
  {
    "id": "automotive_getVehicles",
    "name": "getVehicles",
    "method": "GET",
    "path": "/catalog/2024-11-01/automotive/vehicles",
    "category": "Automotive"
  },
  {
    "id": "catalogItems_listCatalogCategories",
    "name": "listCatalogCategories",
    "method": "GET",
    "path": "/catalog/v0/categories",
    "category": "Catalog Items"
  },
  {
    "id": "catalogItems_searchCatalogItems",
    "name": "searchCatalogItems",
    "method": "GET",
    "path": "/catalog/2020-12-01/items",
    "category": "Catalog Items"
  },
  {
    "id": "catalogItems_getCatalogItem",
    "name": "getCatalogItem",
    "method": "GET",
    "path": "/catalog/2020-12-01/items/{asin}",
    "category": "Catalog Items"
  },
  {
    "id": "catalogItems_searchCatalogItems",
    "name": "searchCatalogItems",
    "method": "GET",
    "path": "/catalog/2022-04-01/items",
    "category": "Catalog Items"
  },
  {
    "id": "catalogItems_getCatalogItem",
    "name": "getCatalogItem",
    "method": "GET",
    "path": "/catalog/2022-04-01/items/{asin}",
    "category": "Catalog Items"
  },
  {
    "id": "customerfeedback_getItemReviewTopics",
    "name": "getItemReviewTopics",
    "method": "GET",
    "path": "/customerFeedback/2024-06-01/items/{asin}/reviews/topics",
    "category": "CustomerFeedback"
  },
  {
    "id": "customerfeedback_getItemBrowseNode",
    "name": "getItemBrowseNode",
    "method": "GET",
    "path": "/customerFeedback/2024-06-01/items/{asin}/browseNode",
    "category": "CustomerFeedback"
  },
  {
    "id": "customerfeedback_getBrowseNodeReviewTopics",
    "name": "getBrowseNodeReviewTopics",
    "method": "GET",
    "path": "/customerFeedback/2024-06-01/browseNodes/{browseNodeId}/reviews/topics",
    "category": "CustomerFeedback"
  },
  {
    "id": "customerfeedback_getItemReviewTrends",
    "name": "getItemReviewTrends",
    "method": "GET",
    "path": "/customerFeedback/2024-06-01/items/{asin}/reviews/trends",
    "category": "CustomerFeedback"
  },
  {
    "id": "customerfeedback_getBrowseNodeReviewTrends",
    "name": "getBrowseNodeReviewTrends",
    "method": "GET",
    "path": "/customerFeedback/2024-06-01/browseNodes/{browseNodeId}/reviews/trends",
    "category": "CustomerFeedback"
  },
  {
    "id": "customerfeedback_getBrowseNodeReturnTopics",
    "name": "getBrowseNodeReturnTopics",
    "method": "GET",
    "path": "/customerFeedback/2024-06-01/browseNodes/{browseNodeId}/returns/topics",
    "category": "CustomerFeedback"
  },
  {
    "id": "customerfeedback_getBrowseNodeReturnTrends",
    "name": "getBrowseNodeReturnTrends",
    "method": "GET",
    "path": "/customerFeedback/2024-06-01/browseNodes/{browseNodeId}/returns/trends",
    "category": "CustomerFeedback"
  },
  {
    "id": "dataKiosk_getQueries",
    "name": "getQueries",
    "method": "GET",
    "path": "/dataKiosk/2023-11-15/queries",
    "category": "Data Kiosk"
  },
  {
    "id": "dataKiosk_createQuery",
    "name": "createQuery",
    "method": "POST",
    "path": "/dataKiosk/2023-11-15/queries",
    "category": "Data Kiosk"
  },
  {
    "id": "dataKiosk_getQuery",
    "name": "getQuery",
    "method": "GET",
    "path": "/dataKiosk/2023-11-15/queries/{queryId}",
    "category": "Data Kiosk"
  },
  {
    "id": "dataKiosk_cancelQuery",
    "name": "cancelQuery",
    "method": "DELETE",
    "path": "/dataKiosk/2023-11-15/queries/{queryId}",
    "category": "Data Kiosk"
  },
  {
    "id": "dataKiosk_getDocument",
    "name": "getDocument",
    "method": "GET",
    "path": "/dataKiosk/2023-11-15/documents/{documentId}",
    "category": "Data Kiosk"
  },
  {
    "id": "deliveryShipmentInvoicing_submitInvoice",
    "name": "submitInvoice",
    "method": "POST",
    "path": "/delivery/2022-07-01/invoice",
    "category": "Delivery Shipment Invoicing"
  },
  {
    "id": "deliveryShipmentInvoicing_getInvoiceStatus",
    "name": "getInvoiceStatus",
    "method": "GET",
    "path": "/delivery/2022-07-01/invoice/status",
    "category": "Delivery Shipment Invoicing"
  },
  {
    "id": "directFulfillmentInventoryUpdates_submitInventoryUpdate",
    "name": "submitInventoryUpdate",
    "method": "POST",
    "path": "/vendor/directFulfillment/inventory/v1/warehouses/{warehouseId}/items",
    "category": "Direct Fulfillment Inventory Updates"
  },
  {
    "id": "directFulfillmentOrders_getOrders",
    "name": "getOrders",
    "method": "GET",
    "path": "/vendor/directFulfillment/orders/v1/purchaseOrders",
    "category": "Direct Fulfillment Orders"
  },
  {
    "id": "directFulfillmentOrders_getOrder",
    "name": "getOrder",
    "method": "GET",
    "path": "/vendor/directFulfillment/orders/v1/purchaseOrders/{purchaseOrderNumber}",
    "category": "Direct Fulfillment Orders"
  },
  {
    "id": "directFulfillmentOrders_submitAcknowledgement",
    "name": "submitAcknowledgement",
    "method": "POST",
    "path": "/vendor/directFulfillment/orders/v1/acknowledgements",
    "category": "Direct Fulfillment Orders"
  },
  {
    "id": "directFulfillmentOrders_getOrders",
    "name": "getOrders",
    "method": "GET",
    "path": "/vendor/directFulfillment/orders/2021-12-28/purchaseOrders",
    "category": "Direct Fulfillment Orders"
  },
  {
    "id": "directFulfillmentOrders_getOrder",
    "name": "getOrder",
    "method": "GET",
    "path": "/vendor/directFulfillment/orders/2021-12-28/purchaseOrders/{purchaseOrderNumber}",
    "category": "Direct Fulfillment Orders"
  },
  {
    "id": "directFulfillmentOrders_submitAcknowledgement",
    "name": "submitAcknowledgement",
    "method": "POST",
    "path": "/vendor/directFulfillment/orders/2021-12-28/acknowledgements",
    "category": "Direct Fulfillment Orders"
  },
  {
    "id": "directFulfillmentPayments_submitInvoice",
    "name": "submitInvoice",
    "method": "POST",
    "path": "/vendor/directFulfillment/payments/v1/invoices",
    "category": "Direct Fulfillment Payments"
  },
  {
    "id": "directFulfillmentShipping_getShippingLabels",
    "name": "getShippingLabels",
    "method": "GET",
    "path": "/vendor/directFulfillment/shipping/v1/shippingLabels",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_submitShippingLabelRequest",
    "name": "submitShippingLabelRequest",
    "method": "POST",
    "path": "/vendor/directFulfillment/shipping/v1/shippingLabels",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_getShippingLabel",
    "name": "getShippingLabel",
    "method": "GET",
    "path": "/vendor/directFulfillment/shipping/v1/shippingLabels/{purchaseOrderNumber}",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_submitShipmentConfirmations",
    "name": "submitShipmentConfirmations",
    "method": "POST",
    "path": "/vendor/directFulfillment/shipping/v1/shipmentConfirmations",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_submitShipmentStatusUpdates",
    "name": "submitShipmentStatusUpdates",
    "method": "POST",
    "path": "/vendor/directFulfillment/shipping/v1/shipmentStatusUpdates",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_getCustomerInvoices",
    "name": "getCustomerInvoices",
    "method": "GET",
    "path": "/vendor/directFulfillment/shipping/v1/customerInvoices",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_getCustomerInvoice",
    "name": "getCustomerInvoice",
    "method": "GET",
    "path": "/vendor/directFulfillment/shipping/v1/customerInvoices/{purchaseOrderNumber}",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_getPackingSlips",
    "name": "getPackingSlips",
    "method": "GET",
    "path": "/vendor/directFulfillment/shipping/v1/packingSlips",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_getPackingSlip",
    "name": "getPackingSlip",
    "method": "GET",
    "path": "/vendor/directFulfillment/shipping/v1/packingSlips/{purchaseOrderNumber}",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_getShippingLabels",
    "name": "getShippingLabels",
    "method": "GET",
    "path": "/vendor/directFulfillment/shipping/2021-12-28/shippingLabels",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_submitShippingLabelRequest",
    "name": "submitShippingLabelRequest",
    "method": "POST",
    "path": "/vendor/directFulfillment/shipping/2021-12-28/shippingLabels",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_getShippingLabel",
    "name": "getShippingLabel",
    "method": "GET",
    "path": "/vendor/directFulfillment/shipping/2021-12-28/shippingLabels/{purchaseOrderNumber}",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_createShippingLabels",
    "name": "createShippingLabels",
    "method": "POST",
    "path": "/vendor/directFulfillment/shipping/2021-12-28/shippingLabels/{purchaseOrderNumber}",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_submitShipmentConfirmations",
    "name": "submitShipmentConfirmations",
    "method": "POST",
    "path": "/vendor/directFulfillment/shipping/2021-12-28/shipmentConfirmations",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_submitShipmentStatusUpdates",
    "name": "submitShipmentStatusUpdates",
    "method": "POST",
    "path": "/vendor/directFulfillment/shipping/2021-12-28/shipmentStatusUpdates",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_getCustomerInvoices",
    "name": "getCustomerInvoices",
    "method": "GET",
    "path": "/vendor/directFulfillment/shipping/2021-12-28/customerInvoices",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_getCustomerInvoice",
    "name": "getCustomerInvoice",
    "method": "GET",
    "path": "/vendor/directFulfillment/shipping/2021-12-28/customerInvoices/{purchaseOrderNumber}",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_getPackingSlips",
    "name": "getPackingSlips",
    "method": "GET",
    "path": "/vendor/directFulfillment/shipping/2021-12-28/packingSlips",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_getPackingSlip",
    "name": "getPackingSlip",
    "method": "GET",
    "path": "/vendor/directFulfillment/shipping/2021-12-28/packingSlips/{purchaseOrderNumber}",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentShipping_createContainerLabel",
    "name": "createContainerLabel",
    "method": "POST",
    "path": "/vendor/directFulfillment/shipping/2021-12-28/containerLabel",
    "category": "Direct Fulfillment Shipping"
  },
  {
    "id": "directFulfillmentTransactionStatus_getTransactionStatus",
    "name": "getTransactionStatus",
    "method": "GET",
    "path": "/vendor/directFulfillment/transactions/v1/transactions/{transactionId}",
    "category": "Direct Fulfillment Transaction Status"
  },
  {
    "id": "directFulfillmentTransactionStatus_getTransactionStatus",
    "name": "getTransactionStatus",
    "method": "GET",
    "path": "/vendor/directFulfillment/transactions/2021-12-28/transactions/{transactionId}",
    "category": "Direct Fulfillment Transaction Status"
  },
  {
    "id": "easyShip_listHandoverSlots",
    "name": "listHandoverSlots",
    "method": "POST",
    "path": "/easyShip/2022-03-23/timeSlot",
    "category": "Easy Ship"
  },
  {
    "id": "easyShip_getScheduledPackage",
    "name": "getScheduledPackage",
    "method": "GET",
    "path": "/easyShip/2022-03-23/package",
    "category": "Easy Ship"
  },
  {
    "id": "externalFulfillmentInventoryManagement_submitInventoryUpdate",
    "name": "submitInventoryUpdate",
    "method": "POST",
    "path": "/externalFulfillment/2024-09-11/inventory",
    "category": "External Fulfillment Inventory Management"
  },
  {
    "id": "fbaInboundEligibility_getItemEligibilityPreview",
    "name": "getItemEligibilityPreview",
    "method": "GET",
    "path": "/fba/inbound/eligibility/v1/items/{asin}/previews",
    "category": "FBA Inbound Eligibility"
  },
  {
    "id": "fbaInboundOperations_createInboundPlan",
    "name": "createInboundPlan",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_getInboundPlan",
    "name": "getInboundPlan",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_updateInboundPlan",
    "name": "updateInboundPlan",
    "method": "PUT",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_cancelInboundPlan",
    "name": "cancelInboundPlan",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/cancellation",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_listInboundPlans",
    "name": "listInboundPlans",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_validateAddresses",
    "name": "validateAddresses",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/addressValidation",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_putTransportDetails",
    "name": "putTransportDetails",
    "method": "PUT",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/transportDetails",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_setTransportDetails",
    "name": "setTransportDetails",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanName}/transportDetails",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_voidTransport",
    "name": "voidTransport",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/transportDetails/voiding",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_confirmTransport",
    "name": "confirmTransport",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/transportDetails/confirmation",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_listPallets",
    "name": "listPallets",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/pallets",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_putPallets",
    "name": "putPallets",
    "method": "PUT",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/pallets",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_updatePallets",
    "name": "updatePallets",
    "method": "PATCH",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/pallets",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_removePallets",
    "name": "removePallets",
    "method": "DELETE",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/pallets",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_listPlacementOptions",
    "name": "listPlacementOptions",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/placementOptions",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_generatePlacementOptions",
    "name": "generatePlacementOptions",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/placementOptions",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_confirmPlacementOption",
    "name": "confirmPlacementOption",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/placementOptions/{placementOptionId}/confirmation",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_getShipment",
    "name": "getShipment",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_listShipmentBoxes",
    "name": "listShipmentBoxes",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/boxes",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_listShipmentContentUpdatePreviews",
    "name": "listShipmentContentUpdatePreviews",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/contentUpdatePreviews",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_generateShipmentContentUpdatePreviews",
    "name": "generateShipmentContentUpdatePreviews",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/contentUpdatePreviews",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_getShipmentContentUpdatePreview",
    "name": "getShipmentContentUpdatePreview",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/contentUpdatePreviews/{contentUpdatePreviewId}",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_confirmShipmentContentUpdatePreview",
    "name": "confirmShipmentContentUpdatePreview",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/contentUpdatePreviews/{contentUpdatePreviewId}/confirmation",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_getDeliveryChallanDocument",
    "name": "getDeliveryChallanDocument",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/deliveryChallanDocument",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_listDeliveryWindowOptions",
    "name": "listDeliveryWindowOptions",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/deliveryWindowOptions",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_generateDeliveryWindowOptions",
    "name": "generateDeliveryWindowOptions",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/deliveryWindowOptions",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_confirmDeliveryWindowOptions",
    "name": "confirmDeliveryWindowOptions",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/deliveryWindowOptions/{deliveryWindowOptionId}/confirmation",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_listShipmentItems",
    "name": "listShipmentItems",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/items",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_updateShipmentName",
    "name": "updateShipmentName",
    "method": "PUT",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/name",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_listShipmentPallets",
    "name": "listShipmentPallets",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/pallets",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_cancelSelfShipAppointment",
    "name": "cancelSelfShipAppointment",
    "method": "PUT",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/selfShipAppointmentCancellation",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_getSelfShipAppointmentSlots",
    "name": "getSelfShipAppointmentSlots",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/selfShipAppointmentSlots",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_generateSelfShipAppointmentSlots",
    "name": "generateSelfShipAppointmentSlots",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/selfShipAppointmentSlots",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_scheduleSelfShipAppointment",
    "name": "scheduleSelfShipAppointment",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/selfShipAppointmentSlots/{slotId}/schedule",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_updateShipmentSourceAddress",
    "name": "updateShipmentSourceAddress",
    "method": "PUT",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/sourceAddress",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_updateShipmentTrackingDetails",
    "name": "updateShipmentTrackingDetails",
    "method": "PUT",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/trackingDetails",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_listTransportationOptions",
    "name": "listTransportationOptions",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/transportationOptions",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_generateTransportationOptions",
    "name": "generateTransportationOptions",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/transportationOptions",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_confirmTransportationOptions",
    "name": "confirmTransportationOptions",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/transportationOptions/confirmation",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_listItemComplianceDetails",
    "name": "listItemComplianceDetails",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/items/compliance",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_updateItemComplianceDetails",
    "name": "updateItemComplianceDetails",
    "method": "PUT",
    "path": "/inbound/fba/2024-03-20/items/compliance",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_createMarketplaceItemLabels",
    "name": "createMarketplaceItemLabels",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/items/labels",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_listPrepDetails",
    "name": "listPrepDetails",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/items/prepDetails",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_setPrepDetails",
    "name": "setPrepDetails",
    "method": "POST",
    "path": "/inbound/fba/2024-03-20/items/prepDetails",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInboundOperations_getInboundOperationStatus",
    "name": "getInboundOperationStatus",
    "method": "GET",
    "path": "/inbound/fba/2024-03-20/operations/{operationId}",
    "category": "FBA inbound operations"
  },
  {
    "id": "fbaInventory_getInventorySummaries",
    "name": "getInventorySummaries",
    "method": "GET",
    "path": "/fba/inventory/v1/summaries",
    "category": "FBA Inventory"
  },
  {
    "id": "fbaInventory_createInventoryItem",
    "name": "createInventoryItem",
    "method": "POST",
    "path": "/fba/inventory/v1/items",
    "category": "FBA Inventory"
  },
  {
    "id": "fbaInventory_deleteInventoryItem",
    "name": "deleteInventoryItem",
    "method": "DELETE",
    "path": "/fba/inventory/v1/items/{sellerSku}",
    "category": "FBA Inventory"
  },
  {
    "id": "fbaInventory_addInventory",
    "name": "addInventory",
    "method": "POST",
    "path": "/fba/inventory/v1/items/inventory",
    "category": "FBA Inventory"
  },
  {
    "id": "feeds_getFeeds",
    "name": "getFeeds",
    "method": "GET",
    "path": "/feeds/2021-06-30/feeds",
    "category": "Feeds"
  },
  {
    "id": "feeds_createFeed",
    "name": "createFeed",
    "method": "POST",
    "path": "/feeds/2021-06-30/feeds",
    "category": "Feeds"
  },
  {
    "id": "feeds_getFeed",
    "name": "getFeed",
    "method": "GET",
    "path": "/feeds/2021-06-30/feeds/{feedId}",
    "category": "Feeds"
  },
  {
    "id": "feeds_cancelFeed",
    "name": "cancelFeed",
    "method": "DELETE",
    "path": "/feeds/2021-06-30/feeds/{feedId}",
    "category": "Feeds"
  },
  {
    "id": "feeds_createFeedDocument",
    "name": "createFeedDocument",
    "method": "POST",
    "path": "/feeds/2021-06-30/documents",
    "category": "Feeds"
  },
  {
    "id": "feeds_getFeedDocument",
    "name": "getFeedDocument",
    "method": "GET",
    "path": "/feeds/2021-06-30/documents/{feedDocumentId}",
    "category": "Feeds"
  },
  {
    "id": "finances_listFinancialEventGroups",
    "name": "listFinancialEventGroups",
    "method": "GET",
    "path": "/finances/v0/financialEventGroups",
    "category": "Finances"
  },
  {
    "id": "finances_listFinancialEventsByGroupId",
    "name": "listFinancialEventsByGroupId",
    "method": "GET",
    "path": "/finances/v0/financialEventGroups/{eventGroupId}/financialEvents",
    "category": "Finances"
  },
  {
    "id": "finances_listFinancialEventsByOrderId",
    "name": "listFinancialEventsByOrderId",
    "method": "GET",
    "path": "/finances/v0/orders/{orderId}/financialEvents",
    "category": "Finances"
  },
  {
    "id": "finances_listFinancialEvents",
    "name": "listFinancialEvents",
    "method": "GET",
    "path": "/finances/v0/financialEvents",
    "category": "Finances"
  },
  {
    "id": "finances_listTransactions",
    "name": "listTransactions",
    "method": "GET",
    "path": "/finances/2024-06-19/transactions",
    "category": "Finances"
  },
  {
    "id": "fulfillmentInbound_getPrepInstructions",
    "name": "getPrepInstructions",
    "method": "GET",
    "path": "/fba/inbound/v0/prepInstructions",
    "category": "Fulfillment Inbound"
  },
  {
    "id": "fulfillmentInbound_getLabels",
    "name": "getLabels",
    "method": "GET",
    "path": "/fba/inbound/v0/shipments/{shipmentId}/labels",
    "category": "Fulfillment Inbound"
  },
  {
    "id": "fulfillmentInbound_getBillOfLading",
    "name": "getBillOfLading",
    "method": "GET",
    "path": "/fba/inbound/v0/shipments/{shipmentId}/billOfLading",
    "category": "Fulfillment Inbound"
  },
  {
    "id": "fulfillmentInbound_getShipments",
    "name": "getShipments",
    "method": "GET",
    "path": "/fba/inbound/v0/shipments",
    "category": "Fulfillment Inbound"
  },
  {
    "id": "fulfillmentInbound_getShipmentItemsByShipmentId",
    "name": "getShipmentItemsByShipmentId",
    "method": "GET",
    "path": "/fba/inbound/v0/shipments/{shipmentId}/items",
    "category": "Fulfillment Inbound"
  },
  {
    "id": "fulfillmentInbound_getShipmentItems",
    "name": "getShipmentItems",
    "method": "GET",
    "path": "/fba/inbound/v0/shipmentItems",
    "category": "Fulfillment Inbound"
  },
  {
    "id": "invoices_getInvoicesAttributes",
    "name": "getInvoicesAttributes",
    "method": "GET",
    "path": "/tax/invoices/2024-06-19/attributes",
    "category": "Invoices"
  },
  {
    "id": "invoices_getInvoicesDocument",
    "name": "getInvoicesDocument",
    "method": "GET",
    "path": "/tax/invoices/2024-06-19/documents/{invoicesDocumentId}",
    "category": "Invoices"
  },
  {
    "id": "invoices_getInvoicesExports",
    "name": "getInvoicesExports",
    "method": "GET",
    "path": "/tax/invoices/2024-06-19/exports",
    "category": "Invoices"
  },
  {
    "id": "invoices_createInvoicesExport",
    "name": "createInvoicesExport",
    "method": "POST",
    "path": "/tax/invoices/2024-06-19/exports",
    "category": "Invoices"
  },
  {
    "id": "invoices_getInvoicesExport",
    "name": "getInvoicesExport",
    "method": "GET",
    "path": "/tax/invoices/2024-06-19/exports/{exportId}",
    "category": "Invoices"
  },
  {
    "id": "invoices_getGovernmentInvoiceStatus",
    "name": "getGovernmentInvoiceStatus",
    "method": "GET",
    "path": "/tax/invoices/2024-06-19/governmentInvoiceRequests",
    "category": "Invoices"
  },
  {
    "id": "invoices_createGovernmentInvoice",
    "name": "createGovernmentInvoice",
    "method": "POST",
    "path": "/tax/invoices/2024-06-19/governmentInvoiceRequests",
    "category": "Invoices"
  },
  {
    "id": "invoices_getGovernmentInvoiceDocument",
    "name": "getGovernmentInvoiceDocument",
    "method": "GET",
    "path": "/tax/invoices/2024-06-19/governmentInvoiceRequests/{shipmentId}",
    "category": "Invoices"
  },
  {
    "id": "invoices_getInvoices",
    "name": "getInvoices",
    "method": "GET",
    "path": "/tax/invoices/2024-06-19/invoices",
    "category": "Invoices"
  },
  {
    "id": "invoices_getInvoice",
    "name": "getInvoice",
    "method": "GET",
    "path": "/tax/invoices/2024-06-19/invoices/{invoiceId}",
    "category": "Invoices"
  },
  {
    "id": "listingsItems_putListingsItem",
    "name": "putListingsItem",
    "method": "PUT",
    "path": "/listings/2020-09-01/items/{sellerId}/{sku}",
    "category": "Listings Items"
  },
  {
    "id": "listingsItems_deleteListingsItem",
    "name": "deleteListingsItem",
    "method": "DELETE",
    "path": "/listings/2020-09-01/items/{sellerId}/{sku}",
    "category": "Listings Items"
  },
  {
    "id": "listingsItems_patchListingsItem",
    "name": "patchListingsItem",
    "method": "PATCH",
    "path": "/listings/2020-09-01/items/{sellerId}/{sku}",
    "category": "Listings Items"
  },
  {
    "id": "listingsItems_getListingsItem",
    "name": "getListingsItem",
    "method": "GET",
    "path": "/listings/2021-08-01/items/{sellerId}/{sku}",
    "category": "Listings Items"
  },
  {
    "id": "listingsItems_putListingsItem",
    "name": "putListingsItem",
    "method": "PUT",
    "path": "/listings/2021-08-01/items/{sellerId}/{sku}",
    "category": "Listings Items"
  },
  {
    "id": "listingsItems_deleteListingsItem",
    "name": "deleteListingsItem",
    "method": "DELETE",
    "path": "/listings/2021-08-01/items/{sellerId}/{sku}",
    "category": "Listings Items"
  },
  {
    "id": "listingsItems_patchListingsItem",
    "name": "patchListingsItem",
    "method": "PATCH",
    "path": "/listings/2021-08-01/items/{sellerId}/{sku}",
    "category": "Listings Items"
  },
  {
    "id": "listingsItems_searchListingsItems",
    "name": "searchListingsItems",
    "method": "GET",
    "path": "/listings/2021-08-01/items/{sellerId}",
    "category": "Listings Items"
  },
  {
    "id": "listingsRestrictions_getListingsRestrictions",
    "name": "getListingsRestrictions",
    "method": "GET",
    "path": "/listings/2021-08-01/restrictions",
    "category": "Listings Restrictions"
  },
  {
    "id": "merchantFulfillment_getEligibleShipmentServices",
    "name": "getEligibleShipmentServices",
    "method": "POST",
    "path": "/mfn/v0/eligibleShippingServices",
    "category": "Merchant Fulfillment"
  },
  {
    "id": "merchantFulfillment_getShipment",
    "name": "getShipment",
    "method": "GET",
    "path": "/mfn/v0/shipments/{shipmentId}",
    "category": "Merchant Fulfillment"
  },
  {
    "id": "merchantFulfillment_cancelShipment",
    "name": "cancelShipment",
    "method": "DELETE",
    "path": "/mfn/v0/shipments/{shipmentId}",
    "category": "Merchant Fulfillment"
  },
  {
    "id": "merchantFulfillment_createShipment",
    "name": "createShipment",
    "method": "POST",
    "path": "/mfn/v0/shipments",
    "category": "Merchant Fulfillment"
  },
  {
    "id": "merchantFulfillment_getAdditionalSellerInputs",
    "name": "getAdditionalSellerInputs",
    "method": "POST",
    "path": "/mfn/v0/additionalSellerInputs",
    "category": "Merchant Fulfillment"
  },
  {
    "id": "messaging_getMessagingActionsForOrder",
    "name": "getMessagingActionsForOrder",
    "method": "GET",
    "path": "/messaging/v1/orders/{amazonOrderId}",
    "category": "Messaging"
  },
  {
    "id": "messaging_confirmCustomizationDetails",
    "name": "confirmCustomizationDetails",
    "method": "POST",
    "path": "/messaging/v1/orders/{amazonOrderId}/messages/confirmCustomizationDetails",
    "category": "Messaging"
  },
  {
    "id": "messaging_createConfirmDeliveryDetails",
    "name": "createConfirmDeliveryDetails",
    "method": "POST",
    "path": "/messaging/v1/orders/{amazonOrderId}/messages/confirmDeliveryDetails",
    "category": "Messaging"
  },
  {
    "id": "messaging_createLegalDisclosure",
    "name": "createLegalDisclosure",
    "method": "POST",
    "path": "/messaging/v1/orders/{amazonOrderId}/messages/legalDisclosure",
    "category": "Messaging"
  },
  {
    "id": "messaging_createConfirmOrderDetails",
    "name": "createConfirmOrderDetails",
    "method": "POST",
    "path": "/messaging/v1/orders/{amazonOrderId}/messages/confirmOrderDetails",
    "category": "Messaging"
  },
  {
    "id": "messaging_createConfirmServiceDetails",
    "name": "createConfirmServiceDetails",
    "method": "POST",
    "path": "/messaging/v1/orders/{amazonOrderId}/messages/confirmServiceDetails",
    "category": "Messaging"
  },
  {
    "id": "messaging_CreateWarranty",
    "name": "CreateWarranty",
    "method": "POST",
    "path": "/messaging/v1/orders/{amazonOrderId}/messages/warranty",
    "category": "Messaging"
  },
  {
    "id": "messaging_GetAttributes",
    "name": "GetAttributes",
    "method": "GET",
    "path": "/messaging/v1/orders/{amazonOrderId}/attributes",
    "category": "Messaging"
  },
  {
    "id": "messaging_createDigitalAccessKey",
    "name": "createDigitalAccessKey",
    "method": "POST",
    "path": "/messaging/v1/orders/{amazonOrderId}/messages/digitalAccessKey",
    "category": "Messaging"
  },
  {
    "id": "messaging_createUnexpectedProblem",
    "name": "createUnexpectedProblem",
    "method": "POST",
    "path": "/messaging/v1/orders/{amazonOrderId}/messages/unexpectedProblem",
    "category": "Messaging"
  },
  {
    "id": "messaging_sendInvoice",
    "name": "sendInvoice",
    "method": "POST",
    "path": "/messaging/v1/orders/{amazonOrderId}/messages/invoice",
    "category": "Messaging"
  },
  {
    "id": "notifications_getSubscription",
    "name": "getSubscription",
    "method": "GET",
    "path": "/notifications/v1/subscriptions/{notificationType}",
    "category": "Notifications"
  },
  {
    "id": "notifications_createSubscription",
    "name": "createSubscription",
    "method": "POST",
    "path": "/notifications/v1/subscriptions/{notificationType}",
    "category": "Notifications"
  },
  {
    "id": "notifications_getSubscriptionById",
    "name": "getSubscriptionById",
    "method": "GET",
    "path": "/notifications/v1/subscriptions/{notificationType}/{subscriptionId}",
    "category": "Notifications"
  },
  {
    "id": "notifications_deleteSubscriptionById",
    "name": "deleteSubscriptionById",
    "method": "DELETE",
    "path": "/notifications/v1/subscriptions/{notificationType}/{subscriptionId}",
    "category": "Notifications"
  },
  {
    "id": "notifications_getDestinations",
    "name": "getDestinations",
    "method": "GET",
    "path": "/notifications/v1/destinations",
    "category": "Notifications"
  },
  {
    "id": "notifications_createDestination",
    "name": "createDestination",
    "method": "POST",
    "path": "/notifications/v1/destinations",
    "category": "Notifications"
  },
  {
    "id": "notifications_getDestination",
    "name": "getDestination",
    "method": "GET",
    "path": "/notifications/v1/destinations/{destinationId}",
    "category": "Notifications"
  },
  {
    "id": "notifications_deleteDestination",
    "name": "deleteDestination",
    "method": "DELETE",
    "path": "/notifications/v1/destinations/{destinationId}",
    "category": "Notifications"
  },
  {
    "id": "orders_getOrders",
    "name": "getOrders",
    "method": "GET",
    "path": "/orders/v0/orders",
    "category": "Orders"
  },
  {
    "id": "orders_getOrder",
    "name": "getOrder",
    "method": "GET",
    "path": "/orders/v0/orders/{orderId}",
    "category": "Orders"
  },
  {
    "id": "orders_getOrderBuyerInfo",
    "name": "getOrderBuyerInfo",
    "method": "GET",
    "path": "/orders/v0/orders/{orderId}/buyerInfo",
    "category": "Orders"
  },
  {
    "id": "orders_getOrderAddress",
    "name": "getOrderAddress",
    "method": "GET",
    "path": "/orders/v0/orders/{orderId}/address",
    "category": "Orders"
  },
  {
    "id": "orders_getOrderItems",
    "name": "getOrderItems",
    "method": "GET",
    "path": "/orders/v0/orders/{orderId}/orderItems",
    "category": "Orders"
  },
  {
    "id": "orders_getOrderItemsBuyerInfo",
    "name": "getOrderItemsBuyerInfo",
    "method": "GET",
    "path": "/orders/v0/orders/{orderId}/orderItems/buyerInfo",
    "category": "Orders"
  },
  {
    "id": "orders_updateShipmentStatus",
    "name": "updateShipmentStatus",
    "method": "POST",
    "path": "/orders/v0/orders/{orderId}/shipment",
    "category": "Orders"
  },
  {
    "id": "orders_getOrderRegulatedInfo",
    "name": "getOrderRegulatedInfo",
    "method": "GET",
    "path": "/orders/v0/orders/{orderId}/regulatedInfo",
    "category": "Orders"
  },
  {
    "id": "orders_updateVerificationStatus",
    "name": "updateVerificationStatus",
    "method": "PATCH",
    "path": "/orders/v0/orders/{orderId}/regulatedInfo",
    "category": "Orders"
  },
  {
    "id": "orders_confirmShipment",
    "name": "confirmShipment",
    "method": "POST",
    "path": "/orders/v0/orders/{orderId}/shipmentConfirmation",
    "category": "Orders"
  },
  {
    "id": "orders_searchOrders",
    "name": "searchOrders",
    "method": "GET",
    "path": "/orders/2026-01-01/orders",
    "category": "Orders"
  },
  {
    "id": "orders_getOrder",
    "name": "getOrder",
    "method": "GET",
    "path": "/orders/2026-01-01/orders/{orderId}",
    "category": "Orders"
  },
  {
    "id": "pricing_getPricing",
    "name": "getPricing",
    "method": "GET",
    "path": "/products/pricing/v0/price",
    "category": "Pricing"
  },
  {
    "id": "pricing_getCompetitivePricing",
    "name": "getCompetitivePricing",
    "method": "GET",
    "path": "/products/pricing/v0/competitivePrice",
    "category": "Pricing"
  },
  {
    "id": "pricing_getListingOffers",
    "name": "getListingOffers",
    "method": "GET",
    "path": "/products/pricing/v0/listings/{SellerSKU}/offers",
    "category": "Pricing"
  },
  {
    "id": "pricing_getItemOffers",
    "name": "getItemOffers",
    "method": "GET",
    "path": "/products/pricing/v0/items/{Asin}/offers",
    "category": "Pricing"
  },
  {
    "id": "pricing_getItemOffersBatch",
    "name": "getItemOffersBatch",
    "method": "POST",
    "path": "/batches/products/pricing/v0/itemOffers",
    "category": "Pricing"
  },
  {
    "id": "pricing_getListingOffersBatch",
    "name": "getListingOffersBatch",
    "method": "POST",
    "path": "/batches/products/pricing/v0/listingOffers",
    "category": "Pricing"
  },
  {
    "id": "pricing_getFeaturedOfferExpectedPriceBatch",
    "name": "getFeaturedOfferExpectedPriceBatch",
    "method": "POST",
    "path": "/batches/products/pricing/2022-05-01/offer/featuredOfferExpectedPrice",
    "category": "Pricing"
  },
  {
    "id": "pricing_getCompetitiveSummary",
    "name": "getCompetitiveSummary",
    "method": "POST",
    "path": "/batches/products/pricing/2022-05-01/items/competitiveSummary",
    "category": "Pricing"
  },
  {
    "id": "productFees_getMyFeesEstimateForSKU",
    "name": "getMyFeesEstimateForSKU",
    "method": "POST",
    "path": "/products/fees/v0/listings/{SellerSKU}/feesEstimate",
    "category": "Product Fees"
  },
  {
    "id": "productFees_getMyFeesEstimateForASIN",
    "name": "getMyFeesEstimateForASIN",
    "method": "POST",
    "path": "/products/fees/v0/items/{Asin}/feesEstimate",
    "category": "Product Fees"
  },
  {
    "id": "productFees_getMyFeesEstimates",
    "name": "getMyFeesEstimates",
    "method": "POST",
    "path": "/products/fees/v0/feesEstimate",
    "category": "Product Fees"
  },
  {
    "id": "productTypeDefinitions_searchDefinitionsProductTypes",
    "name": "searchDefinitionsProductTypes",
    "method": "GET",
    "path": "/definitions/2020-09-01/productTypes",
    "category": "Product Type Definitions"
  },
  {
    "id": "productTypeDefinitions_getDefinitionsProductType",
    "name": "getDefinitionsProductType",
    "method": "GET",
    "path": "/definitions/2020-09-01/productTypes/{productType}",
    "category": "Product Type Definitions"
  },
  {
    "id": "replenishment_getSellingPartnerMetrics",
    "name": "getSellingPartnerMetrics",
    "method": "POST",
    "path": "/replenishment/2022-11-07/sellingPartners/metrics/search",
    "category": "Replenishment"
  },
  {
    "id": "replenishment_listOfferMetrics",
    "name": "listOfferMetrics",
    "method": "POST",
    "path": "/replenishment/2022-11-07/offers/metrics/search",
    "category": "Replenishment"
  },
  {
    "id": "replenishment_listOffers",
    "name": "listOffers",
    "method": "POST",
    "path": "/replenishment/2022-11-07/offers/search",
    "category": "Replenishment"
  },
  {
    "id": "reports_getReports",
    "name": "getReports",
    "method": "GET",
    "path": "/reports/2021-06-30/reports",
    "category": "Reports"
  },
  {
    "id": "reports_createReport",
    "name": "createReport",
    "method": "POST",
    "path": "/reports/2021-06-30/reports",
    "category": "Reports"
  },
  {
    "id": "reports_getReport",
    "name": "getReport",
    "method": "GET",
    "path": "/reports/2021-06-30/reports/{reportId}",
    "category": "Reports"
  },
  {
    "id": "reports_cancelReport",
    "name": "cancelReport",
    "method": "DELETE",
    "path": "/reports/2021-06-30/reports/{reportId}",
    "category": "Reports"
  },
  {
    "id": "reports_getReportSchedules",
    "name": "getReportSchedules",
    "method": "GET",
    "path": "/reports/2021-06-30/schedules",
    "category": "Reports"
  },
  {
    "id": "reports_createReportSchedule",
    "name": "createReportSchedule",
    "method": "POST",
    "path": "/reports/2021-06-30/schedules",
    "category": "Reports"
  },
  {
    "id": "reports_getReportSchedule",
    "name": "getReportSchedule",
    "method": "GET",
    "path": "/reports/2021-06-30/schedules/{reportScheduleId}",
    "category": "Reports"
  },
  {
    "id": "reports_cancelReportSchedule",
    "name": "cancelReportSchedule",
    "method": "DELETE",
    "path": "/reports/2021-06-30/schedules/{reportScheduleId}",
    "category": "Reports"
  },
  {
    "id": "reports_getReportDocument",
    "name": "getReportDocument",
    "method": "GET",
    "path": "/reports/2021-06-30/documents/{reportDocumentId}",
    "category": "Reports"
  },
  {
    "id": "retailProcurementOrders_getPurchaseOrders",
    "name": "getPurchaseOrders",
    "method": "GET",
    "path": "/vendor/orders/v1/purchaseOrders",
    "category": "Retail Procurement Orders"
  },
  {
    "id": "retailProcurementOrders_getPurchaseOrder",
    "name": "getPurchaseOrder",
    "method": "GET",
    "path": "/vendor/orders/v1/purchaseOrders/{purchaseOrderNumber}",
    "category": "Retail Procurement Orders"
  },
  {
    "id": "retailProcurementOrders_submitAcknowledgement",
    "name": "submitAcknowledgement",
    "method": "POST",
    "path": "/vendor/orders/v1/acknowledgements",
    "category": "Retail Procurement Orders"
  },
  {
    "id": "retailProcurementOrders_getPurchaseOrdersStatus",
    "name": "getPurchaseOrdersStatus",
    "method": "GET",
    "path": "/vendor/orders/v1/purchaseOrdersStatus",
    "category": "Retail Procurement Orders"
  },
  {
    "id": "retailProcurementPayments_submitInvoices",
    "name": "submitInvoices",
    "method": "POST",
    "path": "/vendor/payments/v1/invoices",
    "category": "Retail Procurement Payments"
  },
  {
    "id": "retailProcurementShipments_SubmitShipmentConfirmations",
    "name": "SubmitShipmentConfirmations",
    "method": "POST",
    "path": "/vendor/shipping/v1/shipmentConfirmations",
    "category": "Retail Procurement Shipments"
  },
  {
    "id": "retailProcurementShipments_GetShipmentDetails",
    "name": "GetShipmentDetails",
    "method": "GET",
    "path": "/vendor/shipping/v1/shipments",
    "category": "Retail Procurement Shipments"
  },
  {
    "id": "retailProcurementShipments_SubmitShipments",
    "name": "SubmitShipments",
    "method": "POST",
    "path": "/vendor/shipping/v1/shipments",
    "category": "Retail Procurement Shipments"
  },
  {
    "id": "retailProcurementShipments_GetShipmentLabels",
    "name": "GetShipmentLabels",
    "method": "GET",
    "path": "/vendor/shipping/v1/transportLabels",
    "category": "Retail Procurement Shipments"
  },
  {
    "id": "retailProcurementTransactionStatus_getTransaction",
    "name": "getTransaction",
    "method": "GET",
    "path": "/vendor/transactions/v1/transactions/{transactionId}",
    "category": "Retail Procurement Transaction Status"
  },
  {
    "id": "sales_getOrderMetrics",
    "name": "getOrderMetrics",
    "method": "GET",
    "path": "/sales/v1/orderMetrics",
    "category": "Sales"
  },
  {
    "id": "sellers_getMarketplaceParticipations",
    "name": "getMarketplaceParticipations",
    "method": "GET",
    "path": "/sellers/v1/marketplaceParticipations",
    "category": "Sellers"
  },
  {
    "id": "sellers_getAccount",
    "name": "getAccount",
    "method": "GET",
    "path": "/sellers/v1/account",
    "category": "Sellers"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_getFulfillmentPreview",
    "name": "getFulfillmentPreview",
    "method": "POST",
    "path": "/fba/outbound/2020-07-01/fulfillmentOrders/preview",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_deliveryOffers",
    "name": "deliveryOffers",
    "method": "POST",
    "path": "/fba/outbound/2020-07-01/deliveryOffers",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_listAllFulfillmentOrders",
    "name": "listAllFulfillmentOrders",
    "method": "GET",
    "path": "/fba/outbound/2020-07-01/fulfillmentOrders",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_createFulfillmentOrder",
    "name": "createFulfillmentOrder",
    "method": "POST",
    "path": "/fba/outbound/2020-07-01/fulfillmentOrders",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_getPackageTrackingDetails",
    "name": "getPackageTrackingDetails",
    "method": "GET",
    "path": "/fba/outbound/2020-07-01/tracking",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_listReturnReasonCodes",
    "name": "listReturnReasonCodes",
    "method": "GET",
    "path": "/fba/outbound/2020-07-01/returnReasonCodes",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_createFulfillmentReturn",
    "name": "createFulfillmentReturn",
    "method": "PUT",
    "path": "/fba/outbound/2020-07-01/fulfillmentOrders/{sellerFulfillmentOrderId}/return",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_getFulfillmentOrder",
    "name": "getFulfillmentOrder",
    "method": "GET",
    "path": "/fba/outbound/2020-07-01/fulfillmentOrders/{sellerFulfillmentOrderId}",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_updateFulfillmentOrder",
    "name": "updateFulfillmentOrder",
    "method": "PUT",
    "path": "/fba/outbound/2020-07-01/fulfillmentOrders/{sellerFulfillmentOrderId}",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_cancelFulfillmentOrder",
    "name": "cancelFulfillmentOrder",
    "method": "PUT",
    "path": "/fba/outbound/2020-07-01/fulfillmentOrders/{sellerFulfillmentOrderId}/cancel",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_submitFulfillmentOrderStatusUpdate",
    "name": "submitFulfillmentOrderStatusUpdate",
    "method": "PUT",
    "path": "/fba/outbound/2020-07-01/fulfillmentOrders/{sellerFulfillmentOrderId}/status",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_getFeatures",
    "name": "getFeatures",
    "method": "GET",
    "path": "/fba/outbound/2020-07-01/features",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_getFeatureInventory",
    "name": "getFeatureInventory",
    "method": "GET",
    "path": "/fba/outbound/2020-07-01/features/inventory/{featureName}",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "sellingPartnerApisForFulfillmentOutbound_getFeatureSKU",
    "name": "getFeatureSKU",
    "method": "GET",
    "path": "/fba/outbound/2020-07-01/features/inventory/{featureName}/{sellerSku}",
    "category": "Selling Partner APIs for Fulfillment Outbound"
  },
  {
    "id": "services_getServiceJobByServiceJobId",
    "name": "getServiceJobByServiceJobId",
    "method": "GET",
    "path": "/service/v1/serviceJobs/{serviceJobId}",
    "category": "Services"
  },
  {
    "id": "services_cancelServiceJobByServiceJobId",
    "name": "cancelServiceJobByServiceJobId",
    "method": "PUT",
    "path": "/service/v1/serviceJobs/{serviceJobId}/cancellations",
    "category": "Services"
  },
  {
    "id": "services_completeServiceJobByServiceJobId",
    "name": "completeServiceJobByServiceJobId",
    "method": "PUT",
    "path": "/service/v1/serviceJobs/{serviceJobId}/completions",
    "category": "Services"
  },
  {
    "id": "services_getServiceJobs",
    "name": "getServiceJobs",
    "method": "GET",
    "path": "/service/v1/serviceJobs",
    "category": "Services"
  },
  {
    "id": "services_addAppointmentForServiceJobByServiceJobId",
    "name": "addAppointmentForServiceJobByServiceJobId",
    "method": "POST",
    "path": "/service/v1/serviceJobs/{serviceJobId}/appointments",
    "category": "Services"
  },
  {
    "id": "services_rescheduleAppointmentForServiceJobByServiceJobId",
    "name": "rescheduleAppointmentForServiceJobByServiceJobId",
    "method": "POST",
    "path": "/service/v1/serviceJobs/{serviceJobId}/appointments/{appointmentId}",
    "category": "Services"
  },
  {
    "id": "services_assignAppointmentResources",
    "name": "assignAppointmentResources",
    "method": "PUT",
    "path": "/service/v1/serviceJobs/{serviceJobId}/appointments/{appointmentId}/resources",
    "category": "Services"
  },
  {
    "id": "services_setAppointmentFulfillmentData",
    "name": "setAppointmentFulfillmentData",
    "method": "PUT",
    "path": "/service/v1/serviceJobs/{serviceJobId}/appointments/{appointmentId}/fulfillment",
    "category": "Services"
  },
  {
    "id": "services_getRangeSlotCapacity",
    "name": "getRangeSlotCapacity",
    "method": "POST",
    "path": "/service/v1/serviceResources/{resourceId}/capacity/range",
    "category": "Services"
  },
  {
    "id": "services_getFixedSlotCapacity",
    "name": "getFixedSlotCapacity",
    "method": "POST",
    "path": "/service/v1/serviceResources/{resourceId}/capacity/fixed",
    "category": "Services"
  },
  {
    "id": "services_updateSchedule",
    "name": "updateSchedule",
    "method": "PUT",
    "path": "/service/v1/serviceResources/{resourceId}/schedules",
    "category": "Services"
  },
  {
    "id": "services_createReservation",
    "name": "createReservation",
    "method": "POST",
    "path": "/service/v1/reservation",
    "category": "Services"
  },
  {
    "id": "services_updateReservation",
    "name": "updateReservation",
    "method": "PUT",
    "path": "/service/v1/reservation/{reservationId}",
    "category": "Services"
  },
  {
    "id": "services_cancelReservation",
    "name": "cancelReservation",
    "method": "DELETE",
    "path": "/service/v1/reservation/{reservationId}",
    "category": "Services"
  },
  {
    "id": "services_getAppointmmentSlotsByJobId",
    "name": "getAppointmmentSlotsByJobId",
    "method": "GET",
    "path": "/service/v1/serviceJobs/{serviceJobId}/appointmentSlots",
    "category": "Services"
  },
  {
    "id": "services_getAppointmentSlots",
    "name": "getAppointmentSlots",
    "method": "GET",
    "path": "/service/v1/appointmentSlots",
    "category": "Services"
  },
  {
    "id": "services_createServiceDocumentUploadDestination",
    "name": "createServiceDocumentUploadDestination",
    "method": "POST",
    "path": "/service/v1/documents",
    "category": "Services"
  },
  {
    "id": "shipmentInvoicing_getShipmentDetails",
    "name": "getShipmentDetails",
    "method": "GET",
    "path": "/fba/outbound/brazil/v0/shipments/{shipmentId}",
    "category": "Shipment Invoicing"
  },
  {
    "id": "shipmentInvoicing_submitInvoice",
    "name": "submitInvoice",
    "method": "POST",
    "path": "/fba/outbound/brazil/v0/shipments/{shipmentId}/invoice",
    "category": "Shipment Invoicing"
  },
  {
    "id": "shipmentInvoicing_getInvoiceStatus",
    "name": "getInvoiceStatus",
    "method": "GET",
    "path": "/fba/outbound/brazil/v0/shipments/{shipmentId}/invoice/status",
    "category": "Shipment Invoicing"
  },
  {
    "id": "shipping_createShipment",
    "name": "createShipment",
    "method": "POST",
    "path": "/shipping/v1/shipments",
    "category": "Shipping"
  },
  {
    "id": "shipping_getShipment",
    "name": "getShipment",
    "method": "GET",
    "path": "/shipping/v1/shipments/{shipmentId}",
    "category": "Shipping"
  },
  {
    "id": "shipping_cancelShipment",
    "name": "cancelShipment",
    "method": "POST",
    "path": "/shipping/v1/shipments/{shipmentId}/cancel",
    "category": "Shipping"
  },
  {
    "id": "shipping_purchaseLabels",
    "name": "purchaseLabels",
    "method": "POST",
    "path": "/shipping/v1/shipments/{shipmentId}/purchaseLabels",
    "category": "Shipping"
  },
  {
    "id": "shipping_retrieveShippingLabel",
    "name": "retrieveShippingLabel",
    "method": "POST",
    "path": "/shipping/v1/shipments/{shipmentId}/containers/{trackingId}/label",
    "category": "Shipping"
  },
  {
    "id": "shipping_purchaseShipment",
    "name": "purchaseShipment",
    "method": "POST",
    "path": "/shipping/v1/purchaseShipment",
    "category": "Shipping"
  },
  {
    "id": "shipping_getRates",
    "name": "getRates",
    "method": "POST",
    "path": "/shipping/v1/rates",
    "category": "Shipping"
  },
  {
    "id": "shipping_getAccount",
    "name": "getAccount",
    "method": "GET",
    "path": "/shipping/v1/account",
    "category": "Shipping"
  },
  {
    "id": "shipping_getTrackingInformation",
    "name": "getTrackingInformation",
    "method": "GET",
    "path": "/shipping/v1/tracking/{trackingId}",
    "category": "Shipping"
  },
  {
    "id": "solicitations_getSolicitationActionsForOrder",
    "name": "getSolicitationActionsForOrder",
    "method": "GET",
    "path": "/solicitations/v1/orders/{amazonOrderId}",
    "category": "Solicitations"
  },
  {
    "id": "solicitations_createProductReviewAndSellerFeedbackSolicitation",
    "name": "createProductReviewAndSellerFeedbackSolicitation",
    "method": "POST",
    "path": "/solicitations/v1/orders/{amazonOrderId}/solicitations/productReviewAndSellerFeedback",
    "category": "Solicitations"
  },
  {
    "id": "supplySources_getSupplySources",
    "name": "getSupplySources",
    "method": "GET",
    "path": "/supplySources/2020-07-01/supplySources",
    "category": "Supply Sources"
  },
  {
    "id": "supplySources_createSupplySource",
    "name": "createSupplySource",
    "method": "POST",
    "path": "/supplySources/2020-07-01/supplySources",
    "category": "Supply Sources"
  },
  {
    "id": "supplySources_getSupplySource",
    "name": "getSupplySource",
    "method": "GET",
    "path": "/supplySources/2020-07-01/supplySources/{supplySourceId}",
    "category": "Supply Sources"
  },
  {
    "id": "supplySources_updateSupplySource",
    "name": "updateSupplySource",
    "method": "PUT",
    "path": "/supplySources/2020-07-01/supplySources/{supplySourceId}",
    "category": "Supply Sources"
  },
  {
    "id": "supplySources_archiveSupplySource",
    "name": "archiveSupplySource",
    "method": "DELETE",
    "path": "/supplySources/2020-07-01/supplySources/{supplySourceId}",
    "category": "Supply Sources"
  },
  {
    "id": "supplySources_updateSupplySourceStatus",
    "name": "updateSupplySourceStatus",
    "method": "PUT",
    "path": "/supplySources/2020-07-01/supplySources/{supplySourceId}/status",
    "category": "Supply Sources"
  },
  {
    "id": "thirdPartyApplicationIntegrations_createNotification",
    "name": "createNotification",
    "method": "POST",
    "path": "/appIntegrations/2024-04-01/notifications",
    "category": "third party application integrations"
  },
  {
    "id": "thirdPartyApplicationIntegrations_deleteNotifications",
    "name": "deleteNotifications",
    "method": "POST",
    "path": "/appIntegrations/2024-04-01/notifications/deletion",
    "category": "third party application integrations"
  },
  {
    "id": "thirdPartyApplicationIntegrations_recordActionFeedback",
    "name": "recordActionFeedback",
    "method": "POST",
    "path": "/appIntegrations/2024-04-01/notifications/{notificationId}/feedback",
    "category": "third party application integrations"
  },
  {
    "id": "tokens_createRestrictedDataToken",
    "name": "createRestrictedDataToken",
    "method": "POST",
    "path": "/tokens/2021-03-01/restrictedDataToken",
    "category": "Tokens"
  },
  {
    "id": "transfers_initiatePayout",
    "name": "initiatePayout",
    "method": "POST",
    "path": "/finances/transfers/2024-06-01/payouts",
    "category": "Transfers"
  },
  {
    "id": "transfers_getPaymentMethods",
    "name": "getPaymentMethods",
    "method": "GET",
    "path": "/finances/transfers/2024-06-01/paymentMethods",
    "category": "Transfers"
  },
  {
    "id": "uploads_createUploadDestinationForResource",
    "name": "createUploadDestinationForResource",
    "method": "POST",
    "path": "/uploads/2020-11-01/uploadDestinations/{resource}",
    "category": "Uploads"
  },
  {
    "id": "vendorDirectFulfillmentSandboxTestData_generateOrderScenarios",
    "name": "generateOrderScenarios",
    "method": "POST",
    "path": "/vendor/directFulfillment/sandbox/2021-10-28/orders",
    "category": "Vendor Direct Fulfillment Sandbox Test Data"
  },
  {
    "id": "vendorDirectFulfillmentSandboxTestData_getOrderScenarios",
    "name": "getOrderScenarios",
    "method": "GET",
    "path": "/vendor/directFulfillment/sandbox/2021-10-28/transactions/{transactionId}",
    "category": "Vendor Direct Fulfillment Sandbox Test Data"
  }
];
