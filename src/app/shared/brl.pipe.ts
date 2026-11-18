import { Pipe, PipeTransform } from '@angular/core';
import { brl } from '../core/format';

@Pipe({ name: 'brl', standalone: false })
export class BrlPipe implements PipeTransform {
    transform(cents: number | null | undefined): string {
        return brl(cents ?? 0);
    }
}
