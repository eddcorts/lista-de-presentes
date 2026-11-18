import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface ApiFailure {
    status: number;
    message: string;
    details?: unknown;
}

export class ApiClientError extends Error {
    constructor(readonly failure: ApiFailure) {
        super(failure.message);
        this.name = 'ApiClientError';
    }
}

export function toApiFailure(error: unknown): ApiFailure {
    if (error instanceof HttpErrorResponse) {
        const body = error.error as { error?: unknown; details?: unknown } | null;
        const message =
            body && typeof body.error === 'string'
                ? body.error
                : error.status === 0
                    ? 'Não foi possível falar com o servidor. Verifique sua conexão.'
                    : 'Algo deu errado. Tente novamente.';

        return { status: error.status, message, details: body?.details };
    }

    if (error instanceof Error) return { status: 0, message: error.message };
    return { status: 0, message: 'Erro inesperado.' };
}

@Injectable({ providedIn: 'root' })
export class Api {
    private readonly http = inject(HttpClient);
    private readonly base = '/api';

    async get<T>(path: string): Promise<T> {
        return this.run<T>(() => firstValueFrom(this.http.get<T>(`${this.base}${path}`)));
    }

    async post<T>(path: string, body?: unknown): Promise<T> {
        return this.run<T>(() => firstValueFrom(this.http.post<T>(`${this.base}${path}`, body ?? {})));
    }

    async postForm<T>(path: string, form: FormData): Promise<T> {
        return this.run<T>(() => firstValueFrom(this.http.post<T>(`${this.base}${path}`, form)));
    }

    async put<T>(path: string, body: unknown): Promise<T> {
        return this.run<T>(() => firstValueFrom(this.http.put<T>(`${this.base}${path}`, body)));
    }

    async patch<T>(path: string, body: unknown): Promise<T> {
        return this.run<T>(() => firstValueFrom(this.http.patch<T>(`${this.base}${path}`, body)));
    }

    async delete<T>(path: string): Promise<T> {
        return this.run<T>(() => firstValueFrom(this.http.delete<T>(`${this.base}${path}`)));
    }

    private async run<T>(factory: () => Promise<T>): Promise<T> {
        try {
            return await factory();
        } catch (error) {
            throw new ApiClientError(toApiFailure(error));
        }
    }
}
