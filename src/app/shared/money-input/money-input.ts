import {
    ChangeDetectionStrategy,
    Component,
    computed,
    forwardRef,
    input,
    output,
    signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const amountFormatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

@Component({
    selector: 'app-money-input',
    standalone: false,
    templateUrl: './money-input.html',
    styleUrl: './money-input.scss',
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => MoneyInput),
            multi: true,
        },
    ],
})
export class MoneyInput implements ControlValueAccessor {
    readonly label = input('');
    readonly placeholder = input('0,00');
    readonly valueChange = output<number>();

    protected readonly cents = signal(0);
    protected readonly disabled = signal(false);
    protected readonly display = computed(() => amountFormatter.format(this.cents() / 100));

    private onChange: (value: number) => void = () => undefined;
    private onTouched: () => void = () => undefined;

    writeValue(value: unknown): void {
        const cents = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
        this.cents.set(Math.round(cents));
    }

    registerOnChange(fn: (value: number) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.disabled.set(isDisabled);
    }

    protected handleInput(event: Event): void {
        const target = event.target as HTMLInputElement;
        const digits = target.value.replace(/\D/g, '');
        const cents = digits ? Number(digits.slice(0, 11)) : 0;

        this.cents.set(cents);
        this.onChange(cents);
        this.valueChange.emit(cents);
        target.value = amountFormatter.format(cents / 100);
    }

    protected selectAll(event: Event): void {
        (event.target as HTMLInputElement).select();
    }

    protected handleBlur(): void {
        this.onTouched();
    }
}
