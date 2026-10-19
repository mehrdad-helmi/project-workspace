import { inject, Injectable } from '@angular/core';
import type { CollectionQuery } from '@planicam/shared/models';
import type { BatchInput, AssignmentInput } from './fabrication.model';
import { FabricationGateway } from './fabrication.gateway';
@Injectable({ providedIn: 'root' })
export class FabricationService {
	archive(id: string, version: number, archived: boolean) {
		return this.gateway.archive(id, version, archived);
	}
	private readonly gateway = inject(FabricationGateway);
	list(query: CollectionQuery) {
		return this.gateway.list(query);
	}
	detail(id: string) {
		return this.gateway.detail(id);
	}
	create(input: BatchInput) {
		return this.gateway.create(input);
	}
	update(id: string, version: number, input: Partial<BatchInput>) {
		return this.gateway.update(id, version, input);
	}
	remove(id: string, version: number) {
		return this.gateway.remove(id, version);
	}
	assign(id: string, version: number, input: AssignmentInput) {
		return this.gateway.assign(id, version, input);
	}
	unassign(id: string, elementId: string, version: number) {
		return this.gateway.unassign(id, elementId, version);
	}
}
