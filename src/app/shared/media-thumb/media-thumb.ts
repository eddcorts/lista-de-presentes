import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { initials } from '../../core/format';

@Component({
    selector: 'app-media-thumb',
    standalone: false,
    templateUrl: './media-thumb.html',
    styleUrl: './media-thumb.scss',
})
export class MediaThumb {
    readonly url = input<string | undefined>(undefined);
    readonly alt = input<string>('');
    readonly label = input<string>('');

    protected readonly mark = computed(() => initials(this.label() || this.alt() || '?'));

    protected readonly gradient = computed(() => {
        const seed = this.label() || this.alt() || 'presente';
        let hash = 0;
        for (let index = 0; index < seed.length; index += 1) {
            hash = (hash * 31 + seed.charCodeAt(index)) % 360;
        }

        const hue = hash;
        return `linear-gradient(140deg, hsl(${hue} 44% 74%), hsl(${(hue + 38) % 360} 38% 58%))`;
    });
}
