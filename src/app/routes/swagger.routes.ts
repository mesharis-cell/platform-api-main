import express from "express";
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "../../swagger";

const router = express.Router();

const options = {
  customCssUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css",
  customJs: [
    "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.js",
    "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.js",
  ],
};

router.use("/", swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));

const swaggerRoutes = router;

export default swaggerRoutes;
