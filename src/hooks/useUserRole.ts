
import { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';

export function useUserRole() {
    const [roles, setRoles] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [companyPlan, setCompanyPlan] = useState<'plan_i' | 'plan_ii' | null>(null);

    useEffect(() => {
        let mounted = true;

        async function fetchRole() {
            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (session?.user) {
                    const { data } = await supabase
                        .from('profiles')
                        .select('roles, role, company_id')
                        .eq('id', session.user.id)
                        .single();

                    if (mounted && data) {
                        // Support both old 'role' and new 'roles' array
                        const userRoles = data.roles || (data.role ? [data.role] : []) || [];
                        setRoles(userRoles);
                        setIsAdmin(userRoles.includes('admin') || userRoles.includes('super_admin'));

                        if (data.company_id) {
                            const { data: company } = await supabase
                                .from('companies')
                                .select('plan')
                                .eq('id', data.company_id)
                                .single();
                            if (company) setCompanyPlan(company.plan as any);
                        }
                    }
                }
            } catch (error) {
                console.error('Error fetching role:', error);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        fetchRole();

        return () => { mounted = false };
    }, []);

    return { roles, isAdmin, loading, companyPlan };
}
