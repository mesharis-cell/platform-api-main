import type { HttpResponse } from "../support/http";

type MatcherResult = { pass: boolean; message: () => string };

export const toBeDeniedWith = (response: HttpResponse, expected: number): MatcherResult => {
    const pass = response.status === expected;
    return {
        pass,
        message: () =>
            pass
                ? `expected response NOT to be denied with ${expected}, but it was`
                : `expected response to be denied with ${expected}, got ${response.status}` +
                  (response.body ? ` — body: ${JSON.stringify(response.body)}` : ""),
    };
};

export const toBeOk = (response: HttpResponse): MatcherResult => {
    return {
        pass: response.ok,
        message: () =>
            response.ok
                ? `expected response NOT to be OK, but status was ${response.status}`
                : `expected response to be OK, got status ${response.status}` +
                  (response.body ? ` — body: ${JSON.stringify(response.body)}` : ""),
    };
};
