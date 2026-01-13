
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface HistoryDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    historyLogs: any[];
    profiles: Record<string, string>;
}

export function HistoryDialog({
    isOpen,
    onOpenChange,
    historyLogs,
    profiles
}: HistoryDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Histórico de Alterações</DialogTitle></DialogHeader>
                <div className="py-4">
                    {historyLogs.length === 0 ? (
                        <p className="text-center text-zinc-500 py-8">Nenhuma alteração registrada para este item.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Usuário</TableHead>
                                    <TableHead>Motivo</TableHead>
                                    <TableHead>Alteração</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {historyLogs.map(log => (
                                    <TableRow key={log.id}>
                                        <TableCell className="text-xs">{new Date(log.changed_at).toLocaleString()}</TableCell>
                                        <TableCell className="text-xs">{profiles[log.changed_by || ''] || '...'}</TableCell>
                                        <TableCell className="text-xs font-medium">{log.change_reason}</TableCell>
                                        <TableCell className="text-xs">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-red-500 line-through">{log.old_value}</span>
                                                <span className="text-green-600">{log.new_value}</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
