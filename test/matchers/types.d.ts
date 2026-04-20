/**
 * Ambient type augmentation for custom matchers registered via expect.extend
 * in ./index.ts. Keeps `expect(orderId).toHaveOrderStatus(...)` type-safe at
 * call sites throughout scenarios and permission-matrix tests.
 */

import "bun:test";

declare module "bun:test" {
    interface Matchers<T> {
        toHaveOrderStatus(status: string): Promise<void>;
        toHaveFinancialStatus(status: string): Promise<void>;
        toHaveSelfPickupStatus(status: string): Promise<void>;
        toHaveEmittedEvent(eventType: string): Promise<void>;
        toHaveDispatchedEmail(expected: {
            template: string;
            to: string;
            status?: string;
        }): Promise<void>;
        toBeDeniedWith(statusCode: number): void;
        toBeOk(): void;
    }
}
