import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Eye, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuditLog {
    id: string;
    table_name: string;
    action: string;
    record_id: string;
    old_data: any;
    new_data: any;
    created_at: string;
    changed_by: string;
    profiles?: {
        full_name: string;
    }
}

export default function AuditLogs() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        checkAdmin();
        fetchLogs();
    }, []);

    async function checkAdmin() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase.from('profiles').select('role, roles').eq('id', user.id).single();
            const roles = data?.roles || (data?.role ? [data.role] : []);
            setIsAdmin(roles.includes('admin'));
        }
    }

    async function fetchLogs() {
        setLoading(true);
        const { data, error } = await supabase
            .from('audit_logs')
            .select('*, profiles(full_name)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) console.error(error);
        if (data) setLogs(data);
        setLoading(false);
    }

    if (loading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-zinc-50 p-4 text-center text-zinc-500">
                <ShieldAlert className="h-16 w-16 mb-4 text-red-500" />
                <h2 className="text-xl font-bold text-zinc-800">Acesso Restrito</h2>
                <p>Apenas administradores podem ver os logs de auditoria.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Auditoria (Log de Segurança)</h2>
                    <p className="text-zinc-500">Histórico de ações críticas e movimentações.</p>
                </div>
                <Button variant="outline" onClick={fetchLogs}>Atualizar</Button>
            </div>

            <Card className="border-none shadow-md">
                <CardHeader>
                    <CardTitle>Últimos 100 Registros</CardTitle>
                    <CardDescription>Rastreabilidade completa de pagamentos, exclusões e ajustes.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data/Hora</TableHead>
                                <TableHead>Usuário</TableHead>
                                <TableHead>Ação</TableHead>
                                <TableHead>Alvo</TableHead>
                                <TableHead className="text-right">Detalhes</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.map((log) => {
                                const actionColor =
                                    log.action.includes('delete') ? 'destructive' :
                                        log.action.includes('reverse') ? 'warning' :
                                            log.action.includes('pay') ? 'success' : 'default';

                                return (
                                    <TableRow key={log.id}>
                                        <TableCell className="font-mono text-xs text-zinc-500">
                                            {new Date(log.created_at).toLocaleString('pt-BR')}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-zinc-700">{log.profiles?.full_name || 'Sistema'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={actionColor === 'destructive' ? 'destructive' : 'outline'} className={
                                                actionColor === 'success' ? 'border-green-500 text-green-600' :
                                                    actionColor === 'warning' ? 'border-orange-500 text-orange-600' : ''
                                            }>
                                                {log.action.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-zinc-600 text-sm">
                                            {log.table_name} <span className="text-xs text-zinc-400">#{log.record_id?.split('-')[0]}</span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button variant="ghost" size="sm"><Eye className="h-4 w-4 mr-2" /> Ver Diff</Button>
                                                </DialogTrigger>
                                                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                                    <DialogHeader>
                                                        <DialogTitle>Detalhes da Auditoria</DialogTitle>
                                                        <DialogDescription>
                                                            Ação <b>{log.action}</b> em {new Date(log.created_at).toLocaleString()} por {log.profiles?.full_name}
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className="grid grid-cols-2 gap-4 mt-4">
                                                        <div className="p-4 bg-red-50 rounded-md border border-red-100">
                                                            <h4 className="font-semibold text-red-700 mb-2">Antes (Old Data)</h4>
                                                            <div className="h-[200px] w-full rounded-md border p-2 bg-white text-xs font-mono overflow-auto">
                                                                <pre>{JSON.stringify(log.old_data, null, 2) || "N/A"}</pre>
                                                            </div>
                                                        </div>
                                                        <div className="p-4 bg-green-50 rounded-md border border-green-100">
                                                            <h4 className="font-semibold text-green-700 mb-2">Depois (New Data)</h4>
                                                            <div className="h-[200px] w-full rounded-md border p-2 bg-white text-xs font-mono overflow-auto">
                                                                <pre>{JSON.stringify(log.new_data, null, 2) || "N/A"}</pre>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </DialogContent>
                                            </Dialog>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
