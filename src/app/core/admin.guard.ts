import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminSession } from './admin-session';

export const adminGuard: CanActivateFn = async (_route, state) => {
    const session = inject(AdminSession);
    const router = inject(Router);

    if (await session.ensure()) return true;

    return router.createUrlTree(['/admin/login'], {
        queryParams: { next: state.url === '/admin' ? null : state.url },
    });
};
