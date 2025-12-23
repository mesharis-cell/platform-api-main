/**
 * @swagger
 * /api/operations/v1/collection:
 *   post:
 *     tags:
 *       - Collection Management
 *     summary: Create a new collection
 *     description: Creates a new collection for organizing assets. The platform ID is automatically extracted from the X-Platform header.
 *     security:
 *       - BearerAuth: []
 *   get:
 *     tags:
 *       - Collection Management
 *     summary: Get all collections
 *     description: Retrieves a paginated list of collections with filtering and sorting options. CLIENT role users can only see collections from their own company.
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/collection/{id}:
 *   get:
 *     tags:
 *       - Collection Management
 *     summary: Get a single collection by ID
 *     description: Retrieves detailed information about a specific collection including its items.
 *     security:
 *       - BearerAuth: []
 *   patch:
 *     tags:
 *       - Collection Management
 *     summary: Update a collection
 *     description: Updates an existing collection's information. Only ADMIN and LOGISTICS users can update collections.
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     tags:
 *       - Collection Management
 *     summary: Delete a collection
 *     description: Soft deletes a collection by setting its deleted_at timestamp. Only ADMIN users can delete collections.
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/collection/{id}/items:
 *   post:
 *     tags:
 *       - Collection Management
 *     summary: Add an item to a collection
 *     description: Adds an asset to a collection with specified quantity and display order.
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/collection/{id}/items/{itemId}:
 *   patch:
 *     tags:
 *       - Collection Management
 *     summary: Update a collection item
 *     description: Updates a collection item's quantity, notes, or display order.
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     tags:
 *       - Collection Management
 *     summary: Remove an item from a collection
 *     description: Removes an asset from a collection.
 *     security:
 *       - BearerAuth: []
 */
