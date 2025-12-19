/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: API endpoints related to authentication
 */





// Login an user
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login an user
 *     description: Logs in an user with email/contact number and password.
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: x-platform-id
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "5ea04348-cf64-4bf5-9c65-a5823b65aa10"
 *         required: true
 *         description: The platform ID
 *     requestBody:
 *       description: Email and password are required
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email of the user
 *                 example: fazlyalahi.ru@gmail.com
 *               password:
 *                 type: string
 *                 description: The password of the user
 *                 example: Nahid@123
 *     responses:
 *       200:
 *         description: User logged in successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  success:
 *                    type: boolean
 *                    description: Indicates the success or failure of the operation
 *                  message:
 *                    type: string
 *                    description: A message indicating the result of the operation
 *                    example: User logged in successfully
 *                  data:
 *                    type: object
 *                    description: A JSON object representing the logged-in user.
 *       400:
 *         description: If the request is invalid or missing required fields
 *       403:
 *         description: If the email or password is incorrect
 *       404:
 *         description: If the user is not exists
 */



export const authSwagger = {};
