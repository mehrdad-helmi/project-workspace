import {
	type EnvironmentProviders,
	makeEnvironmentProviders,
	provideAppInitializer,
	inject,
} from '@angular/core';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { primeNgConfig } from '../config/primeng.config';
import { ThemeService } from '../services/theme.service';

export function providePlanicamUi(): EnvironmentProviders {
	return makeEnvironmentProviders([
		providePrimeNG(primeNgConfig),
		MessageService,
		provideAppInitializer(() => inject(ThemeService).initialize()),
	]);
}
