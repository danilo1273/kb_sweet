
import { useState, useCallback } from 'react';
import { supabase } from '@/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { BankAccount, FinancialMovement } from '@/types';

export interface BankAccountWithBalance extends BankAccount {
    calculated_balance: number;
}

export function useBanking() {
    const { toast } = useToast();
    const [accounts, setAccounts] = useState<BankAccountWithBalance[]>([]);
    const [loading, setLoading] = useState(false);

    // Fetch Accounts and Calculate Balances
    const fetchAccounts = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Get Accounts
            const { data: accs, error: accError } = await supabase
                .from('bank_accounts')
                .select('*')
                .order('name');

            if (accError) throw accError;

            // 2. Get Balance Summaries (This could be optimized with a view/RPC later)
            // For now, we fetch sums.
            // Since Supabase doesn't support easy GROUP BY in JS client without RPC sometimes, 
            // we might iterate or use a raw query if permissive.
            // Let's stick to a robust client-side calc for MVP or simple RPC if needed. 
            // Actually, for "Extrato", we probably have few accounts. We can Query all movements? No, too heavy.
            // Let's create an RPC for this later if needed. For now, fetch all non-null bank_account_id movements? 
            // Better: Let's assume user just wants list for now, and we calc balance ON DEMAND or individually.
            // But the screen needs to show balance on cards.

            // Let's try to fetch sums from financial_movements grouped by account.
            const { data: movements, error: movError } = await supabase
                .from('financial_movements')
                .select('bank_account_id, amount, type')
                .not('bank_account_id', 'is', null);

            if (movError) throw movError;

            const balMap: Record<string, number> = {};

            movements?.forEach(m => {
                const val = m.type === 'income' ? Math.abs(Number(m.amount)) : -Math.abs(Number(m.amount));
                const bid = m.bank_account_id!; // filtered above
                balMap[bid] = (balMap[bid] || 0) + val;
            });

            const enriched = accs.map((a: BankAccount) => ({
                ...a,
                calculated_balance: Number(a.initial_balance) + (balMap[a.id] || 0)
            }));

            setAccounts(enriched);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Erro ao carregar contas', description: error.message });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    const createAccount = async (name: string, initialBalance: number) => {
        try {
            const { error } = await supabase.from('bank_accounts').insert({ name, initial_balance: initialBalance });
            if (error) throw error;
            toast({ title: 'Conta criada com sucesso!' });
            fetchAccounts();
            return true;
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Erro ao criar conta', description: error.message });
            return false;
        }
    };

    const addTransaction = async (
        bankAccountId: string,
        type: 'income' | 'expense',
        amount: number,
        description: string,
        category: string, // We might treat category as part of description or separate field if FinMov supports it. 
        // fin_mov has 'description'. We can prefix/suffix or just use it. 
        // The Prompt asked for "Category (Yields, Fees)". 
        // We assume FinancialMovement structure. It usually has description.
        date: string
    ) => {
        try {
            const payload = {
                bank_account_id: bankAccountId,
                type,
                amount,
                description: `${category}: ${description}`, // Simple composition for now
                status: 'paid', // Direct bank entry is paid
                payment_date: date, // Confirmed date
                due_date: date,
                created_at: new Date().toISOString()
            };

            const { error } = await supabase.from('financial_movements').insert(payload);
            if (error) throw error;

            toast({ title: 'Lançamento adicionado' });
            fetchAccounts();
            return true;
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Erro ao lançar', description: error.message });
            return false;
        }
    };

    const fetchStatement = async (accountId: string, startDate: string, endDate: string) => {
        // Fetch movements for specific account in range
        const { data, error } = await supabase
            .from('financial_movements')
            .select('*')
            .eq('bank_account_id', accountId)
            .gte('payment_date', startDate)
            .lte('payment_date', endDate)
            .order('payment_date', { ascending: true });

        if (error) throw error;

        // Enrich with Order Info for grouping
        const reqIds = data?.map(m => m.related_purchase_id).filter(Boolean) || [];
        if (reqIds.length > 0) {
            const { data: reqs } = await supabase
                .from('purchase_requests')
                .select('id, order_id, purchase_orders(id, nickname)')
                .in('id', reqIds);

            const reqMap: Record<string, any> = {};
            reqs?.forEach(r => {
                reqMap[r.id] = {
                    id: r.purchase_orders?.id,
                    nickname: r.purchase_orders?.nickname
                };
            });

            return data.map(m => {
                const orderInfo = m.related_purchase_id ? reqMap[m.related_purchase_id] : null;
                return {
                    ...m,
                    order_id: orderInfo?.id,
                    order_nickname: orderInfo?.nickname
                };
            }) as (FinancialMovement & { order_id?: string, order_nickname?: string })[];
        }

        return data as (FinancialMovement & { order_id?: string, order_nickname?: string })[];
    };

    return {
        accounts,
        loading,
        fetchAccounts,
        createAccount,
        addTransaction,
        fetchStatement
    };
}
