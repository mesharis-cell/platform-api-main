import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { AuthServices } from "./Auth.services";
import { AuthSchemas } from "./Auth.schemas";
import { EmailPreferencesService } from "../../services/email-preferences.service";
import CustomizedError from "../../error/customized-error";
import config from "../../config";

const login = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;

    const result = await AuthServices.login(req.body, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "User logged in successfully",
        data: result,
    });
});

const getPlatformByDomain = catchAsync(async (req, res) => {
    // In non-production, allow explicit host override via x-dev-host header
    // This lets local frontends (localhost:3000) resolve platform context
    // by pretending to be a real domain (e.g., kadence.ae or pernod-ricard.kadence.ae)
    const devHostOverride =
        config.node_env !== "production"
            ? (req.headers["x-dev-host"] as string | undefined)
            : undefined;

    const origin = req.headers.origin as string | undefined;
    const forwardedHost = req.headers["x-forwarded-host"] as string | undefined;
    const host = req.headers.host as string | undefined;
    const result = await AuthServices.getConfigByHostname(
        devHostOverride || origin || forwardedHost || host
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Platform fetched successfully",
        data: result,
    });
});

const resetPassword = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await AuthServices.resetPassword(platformId, user, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Password reset successfully",
        data: result,
    });
});

const forgotPassword = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;

    const result = await AuthServices.forgotPassword(platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result.message,
        data: result.data || null,
    });
});

const refresh = catchAsync(async (req, res) => {
    const result = await AuthServices.refresh(req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Token refreshed successfully",
        data: result,
    });
});

const renderUnsubscribePage = ({
    platformName,
    email,
    supportEmail,
    token,
    suppressed,
}: {
    platformName: string;
    email: string;
    supportEmail: string;
    token: string;
    suppressed: boolean;
}) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Email Preferences</title>
    <style>
      body { font-family: Arial, sans-serif; background:#f5f5f5; color:#111; padding:24px; }
      .card { max-width:560px; margin:0 auto; background:#fff; border:1px solid #ddd; border-radius:12px; padding:32px; }
      h1 { margin:0 0 12px; font-size:24px; }
      p { line-height:1.5; color:#444; }
      button { margin-top:16px; padding:12px 18px; border:0; border-radius:8px; background:#111; color:#fff; cursor:pointer; }
      button:disabled { opacity:0.6; cursor:not-allowed; }
      .muted { font-size:12px; color:#666; margin-top:18px; }
      .success { color:#0a7b34; font-weight:600; }
      .error { color:#b42318; font-weight:600; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${platformName} Email Preferences</h1>
      <p>Email: <strong>${email}</strong></p>
      ${
          suppressed
              ? '<p class="success">This address is already unsubscribed from future emails for this platform.</p>'
              : "<p>You can unsubscribe this address from future emails for this platform.</p>"
      }
      ${
          suppressed
              ? ""
              : `<button id="unsubscribe-button">Unsubscribe</button>
      <p id="status" class="muted"></p>
      <script>
        const button = document.getElementById("unsubscribe-button");
        const status = document.getElementById("status");
        button.addEventListener("click", async () => {
          button.disabled = true;
          status.textContent = "Updating preferences...";
          const response = await fetch("/auth/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: ${JSON.stringify(token)} })
          });
          if (response.ok) {
            status.textContent = "You have been unsubscribed successfully.";
            return;
          }
          status.textContent = "We could not update your preferences. Please try again later.";
          button.disabled = false;
        });
      </script>`
      }
      <p class="muted">If you need help, contact <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
    </div>
  </body>
</html>`;

const getUnsubscribePage = catchAsync(async (req, res) => {
    const { token } = AuthSchemas.unsubscribeQuerySchema.parse(req.query);
    const state = await EmailPreferencesService.getUnsubscribeState(token);

    res.status(httpStatus.OK).send(
        renderUnsubscribePage({
            platformName: state.platformName,
            email: state.email,
            supportEmail: state.supportEmail,
            token,
            suppressed: state.suppressed,
        })
    );
});

const unsubscribe = catchAsync(async (req, res) => {
    const token =
        typeof req.body?.token === "string"
            ? req.body.token
            : typeof req.query.token === "string"
              ? req.query.token
              : "";
    if (!token) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "token is required");
    }
    const result = await EmailPreferencesService.unsubscribe(token);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Email preferences updated successfully",
        data: {
            email: result.email,
            platform_id: result.platform_id,
            suppressed: true,
        },
    });
});

export const AuthControllers = {
    login,
    getPlatformByDomain,
    resetPassword,
    forgotPassword,
    refresh,
    getUnsubscribePage,
    unsubscribe,
};
