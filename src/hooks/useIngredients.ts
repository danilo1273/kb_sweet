import { useState, useCallback } from 'react';
import { supabase } from '@/supabaseClient';
import { Ingredient } from '@/types';
import { useToast } from '@/components/ui/use-toast';

export function useIngredients() {
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const fetchIngredients = useCallback(async () => {
        setLoading(true);
        try {
            const { data: ingData, error: ingError } = await supabase
                .from('ingredients')
                .select(`
                    *,
                    product_stocks (
                        quantity,
                        average_cost,
                        location:stock_locations (id, name, slug)
                    )
                `)
                .eq('is_active', true)
                .neq('type', 'expense')
                .order('name');

            if (ingError) throw ingError;

            const { data: prodData, error: prodError } = await supabase
                .from('products')
                .select(`
                    *,
                    product_stocks (
                        quantity,
                        average_cost,
                        location:stock_locations (id, name, slug)
                    )
                `)
                .order('name');

            if (prodError) console.error(prodError);

            const mapStocks = (item: any) => {
                const stocks = item.product_stocks || [];
                // Backward compatibility mapping (optional, but good for safety)
                const stockDanilo = stocks.find((s: any) => s.location?.slug === 'stock-danilo');
                const stockAdriel = stocks.find((s: any) => s.location?.slug === 'stock-adriel');

                return {
                    ...item,
                    type: item.type || 'stock',
                    stocks: stocks.map((s: any) => ({
                        location_id: s.location?.id,
                        location_name: s.location?.name,
                        location_slug: s.location?.slug,
                        quantity: s.quantity,
                        average_cost: s.average_cost
                    })),
                    // Maintain legacy fields for parts of app not yet refactored
                    stock_danilo: stockDanilo ? stockDanilo.quantity : (item.stock_danilo || 0),
                    stock_adriel: stockAdriel ? stockAdriel.quantity : (item.stock_adriel || 0),
                    cost_danilo: stockDanilo ? stockDanilo.average_cost : (item.cost_danilo || 0),
                    cost_adriel: stockAdriel ? stockAdriel.average_cost : (item.cost_adriel || 0),
                };
            };

            const mappedIngredients: Ingredient[] = (ingData || []).map(mapStocks);

            const mappedProducts: Ingredient[] = (prodData || []).map((p: any) => ({
                ...mapStocks(p),
                id: p.id,
                name: p.name,
                category: p.category || 'Produtos',
                unit: p.unit || 'un',
                min_stock: 0,
                type: 'product',
                is_product_entity: true
            }));

            setIngredients([...mappedIngredients, ...mappedProducts]);
        } catch (error: any) {
            console.error(error);
            toast({ variant: "destructive", title: "Erro ao carregar insumos", description: error.message });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    const saveIngredient = async (ingredient: Ingredient) => {
        try {
            if (ingredient.is_product_entity) {
                toast({ variant: 'destructive', title: "Ação Inválida", description: "Produtos Acabados devem ser editados na tela de Receitas." });
                return false;
            }

            if (!ingredient.id) return false;

            const payload = {
                min_stock: Number(ingredient.min_stock || 0),
                name: ingredient.name,
                category: ingredient.category,
                unit: ingredient.unit,
                unit_weight: Number(ingredient.unit_weight || 1),
                unit_type: ingredient.unit_type,
                type: ingredient.type,
                purchase_unit: null,
                purchase_unit_factor: 1
            };

            const { error } = await supabase.from('ingredients').update(payload).eq('id', ingredient.id);
            if (error) throw error;

            toast({ title: "Estoque Mínimo atualizado!" });
            await fetchIngredients();
            return true;
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao salvar", description: error.message });
            return false;
        }
    };

    const deleteIngredient = async (id: string, mode: 'deactivate' | 'delete') => {
        try {
            if (mode === 'deactivate') {
                const { error } = await supabase.from('ingredients').update({ is_active: false }).eq('id', id);
                if (error) throw error;
                toast({ title: "Ingrediente desativado" });
            } else {
                const { error } = await supabase.from('ingredients').delete().eq('id', id);
                if (error) {
                    // Specific error handling for FK constraint
                    throw new Error("Não é possível excluir itens que possuem histórico. Tente desativar.");
                }
                toast({ title: "Ingrediente EXCLUÍDO definitivamente" });
            }
            await fetchIngredients();
            return true;
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao excluir", description: error.message });
            return false;
        }
    };

    return {
        ingredients,
        loading,
        fetchIngredients,
        saveIngredient,
        deleteIngredient
    };
}
