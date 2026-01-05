import { describe, it, expect } from 'vitest';
import { calculateTotalPending, calculateTotalPaid } from './financialUtils';
import { FinancialMovement } from '../types';

describe('Financial Utils', () => {
    // Mock data
    const mockMovements: FinancialMovement[] = [
        {
            id: '1',
            description: 'Item A',
            amount: 100,
            type: 'expense',
            status: 'pending',
            due_date: '2024-01-01',
            payment_date: null,
            created_at: '2024-01-01'
        },
        {
            id: '2',
            description: 'Item B',
            amount: 50,
            type: 'expense',
            status: 'paid',
            due_date: '2024-01-01',
            payment_date: '2024-01-02',
            created_at: '2024-01-01'
        },
        {
            id: '3',
            description: 'Income A',
            amount: 500,
            type: 'income',
            status: 'paid',
            due_date: '2024-01-01',
            payment_date: '2024-01-01',
            created_at: '2024-01-01'
        },
        {
            id: '4',
            description: 'Item C',
            amount: 200,
            type: 'expense',
            status: 'pending',
            due_date: '2024-01-01',
            payment_date: null,
            created_at: '2024-01-01'
        }
    ];

    it('should calculate total pending expenses correctly', () => {
        const total = calculateTotalPending(mockMovements);
        // Item A (100) + Item C (200) = 300
        expect(total).toBe(300);
    });

    it('should calculate total paid expenses correctly', () => {
        const total = calculateTotalPaid(mockMovements);
        // Item B (50) is the only paid expense
        expect(total).toBe(50);
    });

    it('should return 0 if empty list', () => {
        expect(calculateTotalPending([])).toBe(0);
        expect(calculateTotalPaid([])).toBe(0);
    });
});
