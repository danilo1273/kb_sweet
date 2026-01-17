
import { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

interface UserProfileHeaderProps {
    onMenuClick?: () => void;
}

export function UserProfileHeader({ onMenuClick }: UserProfileHeaderProps) {
    const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);

    useEffect(() => {
        async function getProfile() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase
                    .from('profiles')
                    .select('full_name, avatar_url')
                    .eq('id', user.id)
                    .single();
                setProfile(data);
            }
        }
        getProfile();
    }, []);

    const getInitials = (name: string) => {
        return name
            ?.split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2) || 'U';
    };

    return (
        <header className="flex h-16 items-center justify-between border-b bg-white px-4">
            <div className="flex items-center">
                {/* Mobile Menu Button - Visible only on mobile */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onMenuClick}
                    className="mr-4 lg:hidden"
                >
                    <Menu className="h-6 w-6" />
                    <span className="sr-only">Abrir menu</span>
                </Button>

                {/* Logo - Visible only description says "ao lado do logo acima kb sweet" - Assuming mobile context or brand reinforcement */}
                <div className="flex items-center gap-2 lg:hidden">
                    <img src="/logo-kb.png" alt="Logo" className="h-8" />
                    <span className="font-bold text-zinc-900 border-l pl-2 border-zinc-200">KB Sweet</span>
                </div>
            </div>

            {/* User Profile - Always visible */}
            <div className="flex items-center gap-4">
                <div className="hidden md:flex flex-col items-end">
                    <span className="text-sm font-medium text-zinc-900">
                        {profile?.full_name || 'Usuário'}
                    </span>
                </div>
                <Avatar>
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback>{getInitials(profile?.full_name || '')}</AvatarFallback>
                </Avatar>
            </div>
        </header>
    );
}
