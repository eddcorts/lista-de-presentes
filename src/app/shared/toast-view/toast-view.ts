import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Toast } from '../../core/toast';

@Component({
    selector: 'app-toast',
    standalone: false,
    templateUrl: './toast-view.html',
    styleUrl: './toast-view.scss',
})
export class ToastView {
    protected readonly toast = inject(Toast);
}
