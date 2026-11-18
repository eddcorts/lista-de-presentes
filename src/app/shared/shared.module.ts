import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BrlPipe } from './brl.pipe';
import { Icon } from './icon/icon';
import { MediaThumb } from './media-thumb/media-thumb';
import { MoneyInput } from './money-input/money-input';
import { ToastView } from './toast-view/toast-view';
import { CommonModule } from '@angular/common';

const SHARED_DECLARATIONS = [Icon, BrlPipe, MediaThumb, MoneyInput, ToastView,

];
const ANGULAR_COMMON = [RouterOutlet, RouterLink, RouterLinkActive, ReactiveFormsModule, CommonModule];

@NgModule({
    imports: ANGULAR_COMMON,
    declarations: SHARED_DECLARATIONS,
    exports: [...SHARED_DECLARATIONS, ...ANGULAR_COMMON],
})
export class SharedModule { }
