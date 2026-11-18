import { inject, Injectable, signal } from '@angular/core';
import { Api, ApiClientError } from './api';

@Injectable({ providedIn: 'root' })
export class AdminSession {
    private readonly api = inject(Api);
    private readonly state = signal<boolean | null>(null);
    private pending: Promise<boolean> | null = null;

    readonly authenticated = this.state.asReadonly();

    async ensure(force = false): Promise<boolean> {
        if (!force && this.state() !== null) return this.state() === true;
        if (!force && this.pending) return this.pending;

        this.pending = this.api
            .get<{ authenticated: boolean }>('/admin/session')
            .then((response) => {
                this.state.set(response.authenticated);
                return response.authenticated;
            })
            .catch(() => {
                this.state.set(false);
                return false;
            })
            .finally(() => {
                this.pending = null;
            });

        return this.pending;
    }

    async login(password: string): Promise<void> {
        try {
            await this.api.post('/admin/login', { password });
            this.state.set(true);
        } catch (error) {
            if (error instanceof ApiClientError) throw error;
            throw error;
        }
    }

    async logout(): Promise<void> {
        try {
            await this.api.post('/admin/logout');
        } finally {
            this.state.set(false);
        }
    }
}
