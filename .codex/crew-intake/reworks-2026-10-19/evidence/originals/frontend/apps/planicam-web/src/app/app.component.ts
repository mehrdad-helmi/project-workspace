import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHost } from '@planicam/shared/ui';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [RouterOutlet, ToastHost],
	selector: 'planicam-root',
	templateUrl: './app.component.html',
	styleUrl: './app.component.scss',
})
export class App {}
