export interface HubOption {
	readonly value: string;
	readonly label: string;
	readonly unit: string | null;
	readonly order: number;
	readonly [key: string]: unknown;
}
export type HubOptions = Readonly<Partial<Record<string, readonly HubOption[]>>>;
export interface SystemProfile {
	readonly id: string;
	readonly name: string;
	readonly category: string;
	readonly supplier?: { readonly name: string };
}
export interface Currency {
	readonly code: string;
	readonly name: string;
	readonly symbol: string;
	readonly decimalPlaces?: number;
}
export interface PrintoutType {
	readonly id: string;
	readonly name: string;
	readonly category: string;
	readonly scope: string;
	readonly status: string;
	readonly canGenerate: false;
	readonly description?: string | null;
}
export type ConfigValue =
	| string
	| number
	| boolean
	| null
	| readonly ConfigValue[]
	| { readonly [key: string]: ConfigValue };
export type ConfigObject = { readonly [key: string]: ConfigValue };
export interface ConfigurationRecord {
	readonly id: string;
	readonly version: number;
	readonly name?: string;
	readonly config?: ConfigObject;
	readonly [key: string]: unknown;
}

export interface CatalogLookup {
	readonly id: string;
	readonly name: string;
	readonly supplierId?: string;
}
