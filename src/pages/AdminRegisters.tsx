
import { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus, Pencil, Trash2, Search, Database, RefreshCw, Calculator, AlertTriangle, ArrowRight } from 'lucide-react';

export default function AdminRegisters() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'products' | 'suppliers' | 'categories' | 'units'>('products');

    // Data States
    const [dataList, setDataList] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    // Aux Data for Dropdowns
    const [availableCategories, setAvailableCategories] = useState<{ id: string, name: string, type: string }[]>([]);
    const [availableUnits, setAvailableUnits] = useState<{ id: string, name: string }[]>([]);

    // Form Dialog States
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null); // If null, it's adding new
    const [formData, setFormData] = useState<any>({});

    // Migration Dialog States
    const [migrationDialog, setMigrationDialog] = useState<{
        isOpen: boolean;
        itemToDelete: any;
        count: number;
        targetName: string;
        colToCheck: string;
    }>({
        isOpen: false,
        itemToDelete: null,
        count: 0,
        targetName: '',
        colToCheck: ''
    });

    useEffect(() => {
        fetchData();
        fetchAuxData();
    }, [activeTab]);

    async function fetchAuxData() {
        // Always fetch these for the dropdowns, or optimize to fetch only when needed. 
        // For simplicity and small data size, fetching on load/tab change is fine.
        const { data: cats } = await supabase.from('custom_categories').select('*').order('name');
        if (cats) setAvailableCategories(cats);

        const { data: units } = await supabase.from('custom_units').select('*').order('name');
        if (units) setAvailableUnits(units);
    }

    async function fetchData() {
        setLoading(true);
        let table = '';
        let select = '*';
        let order = 'name';

        switch (activeTab) {
            case 'products': table = 'ingredients'; break;
            case 'suppliers': table = 'suppliers'; break;
            case 'categories': table = 'custom_categories'; break;
            case 'units': table = 'custom_units'; break;
        }

        const { data, error } = await supabase.from(table).select(select).order(order);
        if (error) {
            toast({ variant: 'destructive', title: "Erro ao carregar dados", description: error.message });
        } else {
            setDataList(data || []);
        }
        setLoading(false);
    }

    async function handleSave() {
        let table = '';
        const payload = { ...formData };

        // Validation / Cleanup based on tab
        if (!payload.name) return toast({ variant: 'destructive', title: "Nome é obrigatório" });

        switch (activeTab) {
            case 'products':
                table = 'ingredients';
                payload.min_stock = Number(payload.min_stock || 0);
                payload.unit_weight = Number(payload.unit_weight || 1);
                break;
            case 'suppliers':
                table = 'suppliers';
                break;
            case 'categories':
                table = 'custom_categories';
                payload.type = payload.type || 'stock';
                break;
            case 'units':
                table = 'custom_units';
                payload.name = payload.name.toLowerCase();
                break;
        }

        let error;
        if (editingItem) {
            // Check for Rename and Cascade Update
            if (activeTab === 'categories' || activeTab === 'units') {
                const oldName = editingItem.name;
                const newName = payload.name;

                if (oldName !== newName) {
                    const col = activeTab === 'categories' ? 'category' : 'unit';
                    // Update all products using the old name
                    const { error: cascadeError } = await supabase
                        .from('ingredients')
                        .update({ [col]: newName })
                        .eq(col, oldName);

                    if (cascadeError) {
                        console.error("Cascade update failed:", cascadeError);
                        toast({ variant: 'destructive', title: "Erro ao atualizar produtos vinculados", description: cascadeError.message });
                        return;
                    }
                }
            }

            const { error: err } = await supabase.from(table).update(payload).eq('id', editingItem.id);
            error = err;
        } else {
            const { error: err } = await supabase.from(table).insert(payload);
            error = err;
        }

        if (error) {
            toast({ variant: 'destructive', title: "Erro ao salvar", description: error.message });
        } else {
            toast({ title: "Salvo com sucesso!" });
            setIsDialogOpen(false);
            fetchData();
        }
    }

    async function handleDelete(item: any) {
        let table = '';
        let colToCheck = '';

        switch (activeTab) {
            case 'products': table = 'ingredients'; break;
            case 'suppliers': table = 'suppliers'; break;
            case 'categories': table = 'custom_categories'; colToCheck = 'category'; break;
            case 'units': table = 'custom_units'; colToCheck = 'unit'; break;
        }

        // Safe Delete Check for Categories/Units
        if (colToCheck) {
            const { count, error } = await supabase
                .from('ingredients')
                .select('*', { count: 'exact', head: true })
                .eq(colToCheck, item.name);

            if (count && count > 0) {
                // Open Migration Dialog instead of prompt
                setMigrationDialog({
                    isOpen: true,
                    itemToDelete: item,
                    count: count,
                    targetName: '',
                    colToCheck: colToCheck
                });
                return;
            }

            if (!confirm("Tem certeza que deseja excluir este item?")) {
                return;
            }
        } else {
            if (!confirm("Tem certeza que deseja excluir este item?")) return;
        }

        await executeDelete(table, item.id);
    }

    async function confirmMigration() {
        if (!migrationDialog.targetName) return toast({ variant: 'destructive', title: "Digite o nome para migração" });

        try {
            // 1. Migrate Products
            const { error: migrateError } = await supabase
                .from('ingredients')
                .update({ [migrationDialog.colToCheck]: migrationDialog.targetName })
                .eq(migrationDialog.colToCheck, migrationDialog.itemToDelete.name);

            if (migrateError) throw migrateError;

            // 2. Delete the item
            // Determine table name again (simpler to verify tab mostly)
            let table = activeTab === 'categories' ? 'custom_categories' : 'custom_units';
            await executeDelete(table, migrationDialog.itemToDelete.id);

            toast({ title: "Migração e exclusão concluídas!" });
            setMigrationDialog({ ...migrationDialog, isOpen: false });

        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro na migração", description: error.message });
        }
    }

    async function executeDelete(table: string, id: string) {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) {
            toast({ variant: 'destructive', title: "Erro ao excluir", description: error.message });
        } else {
            if (!migrationDialog.isOpen) toast({ title: "Excluído com sucesso!" }); // Only toast if not in migration flow (avoid double toast)
            fetchData();
        }
    }


    async function handleSyncDefaults() {
        if (!confirm("Isso irá escanear todos os produtos existentes e cadastrar suas Categorias e Unidades que ainda não estão salvas. Deseja continuar?")) return;
        setLoading(true);
        try {
            const { data: ingredients, error } = await supabase.from('ingredients').select('category, unit');
            if (error) throw error;

            if (ingredients) {
                // Sync Categories
                const cats = new Set(ingredients.map(i => i.category).filter(c => c && c.trim() !== ''));
                const { data: existingCats } = await supabase.from('custom_categories').select('name');
                const existingCatNames = new Set(existingCats?.map(c => c.name));

                const newCats = Array.from(cats).filter(c => !existingCatNames.has(c));
                if (newCats.length > 0) {
                    await supabase.from('custom_categories').insert(
                        newCats.map(n => ({ name: n, type: 'stock' }))
                    );
                }

                // Sync Units
                const defaultUnits = ['un', 'kg', 'l', 'lata', 'cx', 'pct', 'ml', 'g', 'fardo', 'saco'];
                const units = new Set([...ingredients.map(i => i.unit?.toLowerCase()).filter(Boolean), ...defaultUnits]);
                const { data: existingUnits } = await supabase.from('custom_units').select('name');
                const existingUnitNames = new Set(existingUnits?.map(u => u.name));

                const newUnits = Array.from(units).filter(u => !existingUnitNames.has(u));
                if (newUnits.length > 0) {
                    await supabase.from('custom_units').insert(newUnits.map(n => ({ name: n })));
                }

                toast({ title: "Sincronização concluída", description: `${newCats.length} categorias e ${newUnits.length} unidades adicionadas.` });
                fetchData();
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Erro na sincronização", description: error.message });
        } finally {
            setLoading(false);
        }
    }

    const openMockDialog = (item?: any) => {
        setEditingItem(item || null);
        setFormData(item || {});
        setIsDialogOpen(true);
    };

    // Filter Logic
    const filteredData = dataList.filter(d =>
        d.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Database className="h-6 w-6 text-primary" />
                        Cadastros Gerais
                    </h1>
                    <p className="text-zinc-500">Gerencie todos os registros do sistema em um só lugar.</p>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-lg border shadow-sm">
                <div className="w-full md:w-64">
                    <Label className="text-xs text-zinc-500 mb-1 block">Tipo de Cadastro</Label>
                    <Select value={activeTab} onValueChange={(v: any) => { setActiveTab(v); setSearchTerm(""); }}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="products">Produtos</SelectItem>
                            <SelectItem value="suppliers">Fornecedores</SelectItem>
                            <SelectItem value="categories">Categorias</SelectItem>
                            <SelectItem value="units">Unidades</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex-1 w-full relative">
                    <Label className="text-xs text-zinc-500 mb-1 block">Buscar</Label>
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-400" />
                        <Input
                            placeholder={`Buscar em ${activeTab}...`}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </div>
                <div className="mt-auto flex gap-2">
                    <Button variant="outline" onClick={handleSyncDefaults} title="Sincronizar Categorias e Unidades dos Produtos existentes">
                        <RefreshCw className="h-4 w-4 mr-2" /> Sincronizar
                    </Button>
                    <Button onClick={() => openMockDialog()}>
                        <Plus className="h-4 w-4 mr-2" /> Novo Cadastro
                    </Button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg border shadow-sm overflow-hidden min-h-[400px]">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="animate-spin h-8 w-8 text-primary" />
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Nome</TableHead>
                                {activeTab === 'categories' && <TableHead>Tipo</TableHead>}
                                {activeTab === 'products' && <TableHead>Categoria</TableHead>}
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={activeTab === 'categories' ? 4 : 4} className="text-center py-8 text-zinc-500">
                                        Nenhum registro encontrado.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredData.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="w-[80px] text-zinc-500">#{item.id}</TableCell>
                                        <TableCell className="font-medium">{item.name}</TableCell>

                                        {activeTab === 'categories' && (
                                            <TableCell>
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${item.type === 'expense' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {item.type === 'expense' ? 'Despesa' : 'Estoque'}
                                                </span>
                                            </TableCell>
                                        )}

                                        {activeTab === 'products' && (
                                            <TableCell>
                                                <span className="text-sm text-zinc-600">{item.category || '-'}</span>
                                            </TableCell>
                                        )}

                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" size="icon" onClick={() => openMockDialog(item)}>
                                                    <Pencil className="h-4 w-4 text-zinc-500" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(item)}>
                                                    <Trash2 className="h-4 w-4 text-red-400" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Form Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingItem ? 'Editar' : 'Novo'} {
                            activeTab === 'products' ? 'Produto' :
                                activeTab === 'suppliers' ? 'Fornecedor' :
                                    activeTab === 'categories' ? 'Categoria' : 'Unidade'
                        }</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nome</Label>
                            <Input
                                value={formData.name || ''}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        {activeTab === 'categories' && (
                            <div className="space-y-2">
                                <Label>Tipo</Label>
                                <Select
                                    value={formData.type || 'stock'}
                                    onValueChange={v => setFormData({ ...formData, type: v })}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="stock">Estoque</SelectItem>
                                        <SelectItem value="expense">Despesa</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {activeTab === 'products' && (
                            <>
                                {/* Product Type Radio Group - Standardized */}
                                <div className="space-y-2">
                                    <Label>Tipo de Produto</Label>
                                    <div className="flex gap-4">
                                        <label className="flex items-center space-x-2 border p-3 rounded-md w-full cursor-pointer hover:bg-zinc-50 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-200 transition-colors">
                                            <input
                                                type="radio"
                                                name="productType"
                                                value="stock"
                                                checked={formData.type === 'stock' || !formData.type}
                                                onChange={() => setFormData({ ...formData, type: 'stock' })}
                                                className="text-blue-600"
                                            />
                                            <div className="flex flex-col">
                                                <span className="font-medium text-sm">Estoque</span>
                                                <span className="text-[10px] text-zinc-500">Controla quantidade e custos.</span>
                                            </div>
                                        </label>
                                        <label className="flex items-center space-x-2 border p-3 rounded-md w-full cursor-pointer hover:bg-zinc-50 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-200 transition-colors">
                                            <input
                                                type="radio"
                                                name="productType"
                                                value="expense"
                                                checked={formData.type === 'expense'}
                                                onChange={() => setFormData({ ...formData, type: 'expense', unit_weight: 1, unit_type: '' })}
                                                className="text-blue-600"
                                            />
                                            <div className="flex flex-col">
                                                <span className="font-medium text-sm">Despesa</span>
                                                <span className="text-[10px] text-zinc-500">Apenas registro financeiro.</span>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Categoria</Label>
                                        <div className="flex gap-2">
                                            <Select
                                                value={formData.category}
                                                onValueChange={v => setFormData({ ...formData, category: v })}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder="Selecione..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableCategories
                                                        .filter(c => !formData.type || c.type === formData.type)
                                                        .map(c => (
                                                            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                                        ))}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setActiveTab('categories')}
                                                title="Gerenciar Categorias"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Unidade Principal</Label>
                                        <div className="flex gap-2">
                                            <Select
                                                value={formData.unit}
                                                onValueChange={v => setFormData({ ...formData, unit: v })}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder="Un" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableUnits.map(u => (
                                                        <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setActiveTab('units')}
                                                title="Gerenciar Unidades"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Conversion Section - Only for Stock */}
                                {(!formData.type || formData.type === 'stock') && (
                                    <div className="border rounded-md p-3 bg-zinc-50 space-y-3">
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                id="prod-conversion"
                                                className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                                checked={!!formData.unit_type}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setFormData({ ...formData, unit_weight: 0, unit_type: 'g' });
                                                    } else {
                                                        setFormData({ ...formData, unit_weight: 1, unit_type: '' });
                                                    }
                                                }}
                                            />
                                            <Label htmlFor="prod-conversion" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                                <Calculator className="h-4 w-4 text-zinc-500" />
                                                Habilitar conversão secundária (Receita)
                                            </Label>
                                        </div>

                                        {(!!formData.unit_type) && (
                                            <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2">
                                                <div className="space-y-1">
                                                    <Label className="text-[10px]">Unid. Secundária</Label>
                                                    <Select
                                                        value={formData.unit_type}
                                                        onValueChange={v => setFormData({ ...formData, unit_type: v })}
                                                    >
                                                        <SelectTrigger className="h-8">
                                                            <SelectValue placeholder="Selecione..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {availableUnits.map(u => (
                                                                <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[10px]">Fator de Conversão</Label>
                                                    <Input
                                                        type="number"
                                                        value={formData.unit_weight || ''}
                                                        onChange={e => setFormData({ ...formData, unit_weight: Number(e.target.value) })}
                                                        className="h-8 text-xs"
                                                        placeholder="Ex: 395"
                                                    />
                                                </div>
                                                <div className="col-span-2">
                                                    <div className="flex gap-2 items-center">
                                                        <div className="space-y-1 flex-1">
                                                            <Label className="text-[10px]">Estoque Mínimo</Label>
                                                            <Input
                                                                type="number"
                                                                value={formData.min_stock || 0}
                                                                onChange={e => setFormData({ ...formData, min_stock: Number(e.target.value) })}
                                                                className="h-8"
                                                            />
                                                        </div>
                                                        <div className="space-y-1 flex-1">
                                                            <Label className="text-[10px]">Un. Compra (Opcional)</Label>
                                                            <Select
                                                                value={formData.purchase_unit}
                                                                onValueChange={v => setFormData({ ...formData, purchase_unit: v })}
                                                            >
                                                                <SelectTrigger className="h-8">
                                                                    <SelectValue placeholder="Selecione..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="none">Nenhuma</SelectItem>
                                                                    {availableUnits.map(u => (
                                                                        <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-span-2 mt-2">
                                                    <p className="text-[11px] text-zinc-500 bg-white p-2 border rounded text-center italic">
                                                        "1 <strong>{formData.unit || '...'}</strong> equivale a <strong>{formData.unit_weight || '?'} {formData.unit_type || '...'}</strong>"
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* If conversion disabled, still show min stock nicely */}
                                        {(!formData.unit_type) && (
                                            <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-zinc-200">
                                                <div className="space-y-1">
                                                    <Label className="text-[10px]">Estoque Mínimo</Label>
                                                    <Input
                                                        type="number"
                                                        value={formData.min_stock || 0}
                                                        onChange={e => setFormData({ ...formData, min_stock: Number(e.target.value) })}
                                                        className="h-8"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave}>Salvar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Migration Dialog */}
            <Dialog open={migrationDialog.isOpen} onOpenChange={(open) => !open && setMigrationDialog({ ...migrationDialog, isOpen: false })}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="h-5 w-5" />
                            Atenção: Item em Uso
                        </DialogTitle>
                        <DialogDescription>
                            Este item está configurado em <strong>{migrationDialog.count}</strong> produtos.
                            Para excluí-lo, você precisa migrar esses produtos para outra opção.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="p-3 bg-zinc-50 rounded border flex items-center gap-3">
                            <span className="font-bold text-zinc-500 strike-through line-through decoration-red-500">
                                {migrationDialog.itemToDelete?.name}
                            </span>
                            <ArrowRight className="h-4 w-4 text-zinc-400" />
                            <Input
                                placeholder="Novo nome para migrar..."
                                value={migrationDialog.targetName}
                                onChange={(e) => setMigrationDialog({ ...migrationDialog, targetName: e.target.value })}
                                className="flex-1"
                            />
                        </div>
                        <p className="text-xs text-zinc-500">
                            Digite o nome exato da categoria/unidade para onde os produtos serão movidos.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMigrationDialog({ ...migrationDialog, isOpen: false })}>Cancelar</Button>
                        <Button onClick={confirmMigration} className="bg-amber-600 hover:bg-amber-700">Migrar e Excluir</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}
