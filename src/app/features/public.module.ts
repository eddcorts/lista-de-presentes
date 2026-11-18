import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { CartPage } from './cart/cart-page';
import { OrderPage } from './order/order-page';
import { PublicLayout } from './public-layout/public-layout';
import { DonationCard } from './wishlist/donation-card/donation-card';
import { ItemCard } from './wishlist/item-card/item-card';
import { ItemDetailDialog } from './wishlist/item-detail-dialog/item-detail-dialog';
import { WishlistPage } from './wishlist/wishlist-page/wishlist-page';

const PUBLIC_COMPONENTS = [
    PublicLayout,
    WishlistPage,
    ItemCard,
    ItemDetailDialog,
    DonationCard,
    CartPage,
    OrderPage,
];

@NgModule({
    imports: [SharedModule],
    declarations: PUBLIC_COMPONENTS,
})
export class PublicModule {}
