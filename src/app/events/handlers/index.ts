import { eventBus } from "../event-bus";
import { handleEmailNotifications } from "./email.handler";

export function registerHandlers(): void {
    // Email handler listens to ALL events
    eventBus.onAll(handleEmailNotifications);
    console.log("[EventBus] Handlers registered");
}
