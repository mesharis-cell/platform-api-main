import { db } from "../../db";
import { systemEvents } from "../../db/schema";
import { EmitEventInput, SystemEvent } from "./event-types";

type EventHandler = (event: SystemEvent) => Promise<void>;

class EventBus {
    private handlers: Map<string, EventHandler[]> = new Map();
    private globalHandlers: EventHandler[] = [];

    on(eventType: string, handler: EventHandler): void {
        const existing = this.handlers.get(eventType) || [];
        this.handlers.set(eventType, [...existing, handler]);
    }

    onAll(handler: EventHandler): void {
        this.globalHandlers.push(handler);
    }

    async emit(input: EmitEventInput): Promise<void> {
        // 1. Persist the event
        const [saved] = await db
            .insert(systemEvents)
            .values({
                platform_id: input.platform_id,
                event_type: input.event_type,
                entity_type: input.entity_type,
                entity_id: input.entity_id,
                actor_id: input.actor_id ?? null,
                actor_role: input.actor_role ?? null,
                payload: input.payload,
            })
            .returning();

        const event = saved as SystemEvent;

        // 2. Run type-specific handlers
        const typeHandlers = this.handlers.get(input.event_type) || [];
        for (const handler of typeHandlers) {
            try {
                await handler(event);
            } catch (err) {
                console.error(`[EventBus] Handler failed for ${input.event_type}:`, err);
            }
        }

        // 3. Run global handlers (email handler registers here)
        for (const handler of this.globalHandlers) {
            try {
                await handler(event);
            } catch (err) {
                console.error(`[EventBus] Global handler failed for ${input.event_type}:`, err);
            }
        }
    }
}

export const eventBus = new EventBus();
