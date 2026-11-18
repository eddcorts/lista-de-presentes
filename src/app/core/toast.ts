import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info';

@Injectable({ providedIn: 'root' })
export class Toast {
    readonly message = signal<string | null>(null);
    readonly tone = signal<ToastTone>('success');
    private timer: ReturnType<typeof setTimeout> | undefined;

    show(message: string, tone: ToastTone = 'success'): void {
        if (this.timer) clearTimeout(this.timer);
        this.message.set(message);
        this.tone.set(tone);
        this.timer = setTimeout(() => this.message.set(null), 3800);
    }

    clear(): void {
        if (this.timer) clearTimeout(this.timer);
        this.message.set(null);
    }
}
