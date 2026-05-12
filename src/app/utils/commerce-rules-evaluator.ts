/**
 * Commerce rules evaluator (Item 6 of the 9-item bundle).
 *
 * Pure function — no DB access. Given a normalized cart and a list of
 * rules already fetched by the caller, returns the rule hits the client
 * should be warned about. v1 supports:
 *   - QUANTITY rules: warn if cart-level qty for a target asset/family
 *     is below (QUANTITY_LT) or above (QUANTITY_GT) a threshold.
 *   - COMPANION rules: warn if the cart contains the rule's target but
 *     does NOT contain the rule's companion target.
 *
 * Schema is forward-compat for CONFLICT / CATEGORY / BRAND rule types
 * and BLOCK / SUGGEST severities. Adding them later is UI-only; the
 * evaluator's discriminated unions force exhaustiveness.
 */

export type CommerceRuleTarget =
    | { kind: "ASSET"; asset_id: string }
    | { kind: "FAMILY"; family_id: string };

export type CommerceRulePredicate =
    | { kind: "QUANTITY_LT"; threshold: number }
    | { kind: "QUANTITY_GT"; threshold: number }
    | { kind: "COMPANION_REQUIRED"; companion_target: CommerceRuleTarget };

export type CommerceRuleSeverity = "WARN" | "BLOCK" | "SUGGEST";
export type CommerceRuleType = "QUANTITY" | "COMPANION" | "CONFLICT" | "CATEGORY" | "BRAND";

export type CommerceRule = {
    id: string;
    name: string;
    rule_type: CommerceRuleType;
    severity: CommerceRuleSeverity;
    target: CommerceRuleTarget;
    predicate: CommerceRulePredicate;
    message: string;
};

export type CartLine = {
    asset_id: string;
    family_id?: string | null;
    quantity: number;
};

export type CommerceRuleHit = {
    rule_id: string;
    severity: CommerceRuleSeverity;
    message: string;
    rule_name: string;
    related_asset_id?: string;
    related_family_id?: string;
};

const matchesTarget = (line: CartLine, target: CommerceRuleTarget): boolean => {
    if (target.kind === "ASSET") return line.asset_id === target.asset_id;
    if (target.kind === "FAMILY") return line.family_id === target.family_id;
    return false;
};

const totalQtyOnTarget = (cart: CartLine[], target: CommerceRuleTarget): number =>
    cart
        .filter((line) => matchesTarget(line, target))
        .reduce((sum, line) => sum + (line.quantity || 0), 0);

const cartContainsTarget = (cart: CartLine[], target: CommerceRuleTarget): boolean =>
    cart.some((line) => matchesTarget(line, target));

export const evaluateCommerceRules = (
    cart: CartLine[],
    rules: CommerceRule[]
): CommerceRuleHit[] => {
    const hits: CommerceRuleHit[] = [];

    for (const rule of rules) {
        switch (rule.rule_type) {
            case "QUANTITY": {
                // QUANTITY rules only fire when the target appears in cart.
                if (!cartContainsTarget(cart, rule.target)) break;
                const total = totalQtyOnTarget(cart, rule.target);
                const pred = rule.predicate;
                if (pred.kind === "QUANTITY_LT" && total < pred.threshold) {
                    hits.push({
                        rule_id: rule.id,
                        rule_name: rule.name,
                        severity: rule.severity,
                        message: rule.message,
                        related_asset_id:
                            rule.target.kind === "ASSET" ? rule.target.asset_id : undefined,
                        related_family_id:
                            rule.target.kind === "FAMILY" ? rule.target.family_id : undefined,
                    });
                }
                if (pred.kind === "QUANTITY_GT" && total > pred.threshold) {
                    hits.push({
                        rule_id: rule.id,
                        rule_name: rule.name,
                        severity: rule.severity,
                        message: rule.message,
                        related_asset_id:
                            rule.target.kind === "ASSET" ? rule.target.asset_id : undefined,
                        related_family_id:
                            rule.target.kind === "FAMILY" ? rule.target.family_id : undefined,
                    });
                }
                break;
            }
            case "COMPANION": {
                if (rule.predicate.kind !== "COMPANION_REQUIRED") break;
                if (!cartContainsTarget(cart, rule.target)) break;
                if (cartContainsTarget(cart, rule.predicate.companion_target)) break;
                hits.push({
                    rule_id: rule.id,
                    rule_name: rule.name,
                    severity: rule.severity,
                    message: rule.message,
                    related_asset_id:
                        rule.target.kind === "ASSET" ? rule.target.asset_id : undefined,
                    related_family_id:
                        rule.target.kind === "FAMILY" ? rule.target.family_id : undefined,
                });
                break;
            }
            // v2 rule kinds — not surfaced in v1 UI. Ignored at the
            // evaluator level so unused enum values are safe to insert
            // directly into the DB during forward-compat testing.
            case "CONFLICT":
            case "CATEGORY":
            case "BRAND":
                break;
            default: {
                // Exhaustiveness check — adding a new kind forces both the
                // type and this switch to update.
                const _exhaustive: never = rule.rule_type;
                void _exhaustive;
            }
        }
    }

    return hits;
};
