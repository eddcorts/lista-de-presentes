import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AdminApi } from '../../../core/admin-api';
import { AdminSession } from '../../../core/admin-session';
import { Toast } from '../../../core/toast';
import { type IconName } from '../../../shared/icon/icon';

interface NavItem {
    label: string;
    path: string;
    icon: IconName;
    exact?: boolean;
}

@Component({
    selector: 'app-admin-shell',
    standalone: false,
    templateUrl: './admin-shell.html',
    styleUrl: './admin-shell.scss',
})
export class AdminShell {
    private readonly session = inject(AdminSession);
    private readonly router = inject(Router);
    private readonly api = inject(AdminApi);
    private readonly toast = inject(Toast);

    protected readonly owner = computed(() => this.api.wishlist()?.meta.ownerName ?? 'Painel');

    protected readonly nav: NavItem[] = [
        { label: 'Painel', path: '/admin', icon: 'dashboard', exact: true },
        { label: 'Presentes', path: '/admin/presentes', icon: 'box' },
        { label: 'Categorias', path: '/admin/categorias', icon: 'tag' },
        { label: 'Pedidos', path: '/admin/pedidos', icon: 'users' },
        { label: 'Configurações', path: '/admin/configuracoes', icon: 'settings' },
    ];

    constructor() {
        void this.api.refresh().catch(() => undefined);
    }

    protected async logout(): Promise<void> {
        await this.session.logout();
        this.toast.show('Sessão encerrada.', 'info');
        await this.router.navigate(['/admin/login']);
    }
}
