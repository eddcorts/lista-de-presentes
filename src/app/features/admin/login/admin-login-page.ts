import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toApiFailure } from '../../../core/api';
import { AdminSession } from '../../../core/admin-session';

@Component({
    selector: 'app-admin-login-page',
    standalone: false,
    templateUrl: './admin-login-page.html',
    styleUrl: './admin-login-page.scss',
})
export class AdminLoginPage {
    private readonly session = inject(AdminSession);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly formBuilder = inject(FormBuilder);

    protected readonly submitting = signal(false);
    protected readonly error = signal<string | null>(null);
    protected readonly showPassword = signal(false);

    protected readonly form = this.formBuilder.nonNullable.group({
        password: ['', [Validators.required]],
    });

    constructor() {
        void this.session.ensure().then((authenticated) => {
            if (authenticated) void this.goNext();
        });
    }

    protected togglePassword(): void {
        this.showPassword.update((value) => !value);
    }

    protected async submit(): Promise<void> {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.submitting.set(true);
        this.error.set(null);

        try {
            await this.session.login(this.form.controls.password.value);
            await this.goNext();
        } catch (error) {
            this.error.set(toApiFailure(error).message);
        } finally {
            this.submitting.set(false);
        }
    }

    private async goNext(): Promise<void> {
        const next = this.route.snapshot.queryParamMap.get('next');
        await this.router.navigateByUrl(next && next.startsWith('/') ? next : '/admin');
    }
}
