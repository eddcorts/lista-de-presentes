import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { AdminCategoriesPage } from './categories/categories-page';
import { AdminDashboardPage } from './dashboard/dashboard-page';
import { ItemDialog } from './items/item-dialog/item-dialog';
import { AdminItemsPage } from './items/items-page/items-page';
import { AdminLoginPage } from './login/admin-login-page';
import { AdminOrdersPage } from './orders/orders-page';
import { AdminSettingsPage } from './settings/settings-page';
import { AdminShell } from './shell/admin-shell';

const ADMIN_COMPONENTS = [
    AdminLoginPage,
    AdminShell,
    AdminDashboardPage,
    AdminItemsPage,
    ItemDialog,
    AdminCategoriesPage,
    AdminOrdersPage,
    AdminSettingsPage,
];

@NgModule({
    imports: [SharedModule],
    declarations: ADMIN_COMPONENTS,
})
export class AdminModule {}
