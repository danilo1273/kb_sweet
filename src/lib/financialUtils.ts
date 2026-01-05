import { FinancialMovement } from "../types";

export function calculateTotalPending(movements: FinancialMovement[]): number {
    return movements
        .filter(m => m.type === 'expense' && m.status === 'pending')
        .reduce((acc, curr) => acc + curr.amount, 0);
}

export function calculateTotalPaid(movements: FinancialMovement[]): number {
    return movements
        .filter(m => m.type === 'expense' && m.status === 'paid')
        .reduce((acc, curr) => acc + curr.amount, 0);
}
