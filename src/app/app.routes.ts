import { Routes } from '@angular/router';
import { adminGuard } from './core/admin.guard';
import { PublicLayout } from './features/public-layout/public-layout';
import { WishlistPage } from './features/wishlist/wishlist-page/wishlist-page';
import { CartPage } from './features/cart/cart-page';
import { OrderPage } from './features/order/order-page';
import { AdminLoginPage } from './features/admin/login/admin-login-page';
import { AdminShell } from './features/admin/shell/admin-shell';
import { AdminDashboardPage } from './features/admin/dashboard/dashboard-page';
import { AdminItemsPage } from './features/admin/items/items-page/items-page';
import { AdminCategoriesPage } from './features/admin/categories/categories-page';
import { AdminOrdersPage } from './features/admin/orders/orders-page';
import { AdminSettingsPage } from './features/admin/settings/settings-page';

export const routes: Routes = [
    {
        path: '',
        component: PublicLayout,
        children: [
            {
                path: '',
                title: 'Lista de presentes',
                component: WishlistPage,
            },
            {
                path: 'escolhidos',
                title: 'Escolhidos · Lista de presentes',
                component: CartPage,
            },
            {
                path: 'carrinho',
                redirectTo: 'escolhidos',
                pathMatch: 'full',
            },
            {
                path: 'pedido/:token',
                title: 'Seu pedido · Lista de presentes',
                component: OrderPage,
            },
        ],
    },
    {
        path: 'admin/login',
        title: 'Entrar no painel',
        component: AdminLoginPage,
    },
    {
        path: 'admin',
        canActivate: [adminGuard],
        component: AdminShell,
        children: [
            {
                path: '',
                title: 'Painel',
                component: AdminDashboardPage,
            },
            {
                path: 'presentes',
                title: 'Presentes · Painel',
                component: AdminItemsPage,
            },
            {
                path: 'categorias',
                title: 'Categorias · Painel',
                component: AdminCategoriesPage,
            },
            {
                path: 'pedidos',
                title: 'Pedidos · Painel',
                component: AdminOrdersPage,
            },
            {
                path: 'configuracoes',
                title: 'Configurações · Painel',
                component: AdminSettingsPage,
            },
        ],
    },
    { path: '**', redirectTo: '' },
];
