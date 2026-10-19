import { inject, Injectable } from '@angular/core';
import type {
	ProjectInput,
	ProjectUpdate,
	ProjectPhase,
	PositionInput,
	PositionUpdate,
	ElementUpdate,
} from './project.model';
import type { CollectionQuery } from '@planicam/shared/models';
import { ProjectGateway } from './project.gateway';
@Injectable({ providedIn: 'root' })
export class ProjectService {
	private readonly gateway = inject(ProjectGateway);
	statistics() {
		return this.gateway.statistics();
	}
	projects(query: CollectionQuery) {
		return this.gateway.projects(query);
	}
	project(id: string) {
		return this.gateway.project(id);
	}
	createProject(input: ProjectInput) {
		return this.gateway.createProject(input);
	}
	updateProject(id: string, version: number, input: ProjectUpdate) {
		return this.gateway.updateProject(id, version, input);
	}
	archiveProject(id: string, version: number, archived: boolean) {
		return this.gateway.archiveProject(id, version, archived);
	}
	favoriteProject(id: string, isFavorite: boolean) {
		return this.gateway.favoriteProject(id, isFavorite);
	}
	folders() {
		return this.gateway.folders();
	}
	createFolder(name: string, parentId: string | null) {
		return this.gateway.createFolder(name, parentId);
	}
	updateFolder(
		id: string,
		version: number,
		name: string,
		parentId?: string | null,
	) {
		return this.gateway.updateFolder(id, version, name, parentId);
	}
	removeFolder(id: string, version: number) {
		return this.gateway.removeFolder(id, version);
	}
	phases(projectId: string) {
		return this.gateway.phases(projectId);
	}
	createPhase(projectId: string, name: string) {
		return this.gateway.createPhase(projectId, name);
	}
	updatePhase(
		projectId: string,
		id: string,
		version: number,
		input: Partial<Pick<ProjectPhase, 'name' | 'description' | 'sortOrder'>>,
	) {
		return this.gateway.updatePhase(projectId, id, version, input);
	}
	removePhase(projectId: string, id: string, version: number) {
		return this.gateway.removePhase(projectId, id, version);
	}
	positions(query: CollectionQuery) {
		return this.gateway.positions(query);
	}
	position(id: string) {
		return this.gateway.position(id);
	}
	createPosition(input: PositionInput) {
		return this.gateway.createPosition(input);
	}
	updatePosition(id: string, version: number, input: PositionUpdate) {
		return this.gateway.updatePosition(id, version, input);
	}
	archivePosition(id: string, version: number, archived: boolean) {
		return this.gateway.archivePosition(id, version, archived);
	}
	favoritePosition(id: string, isFavorite: boolean) {
		return this.gateway.favoritePosition(id, isFavorite);
	}
	quantity(id: string, version: number, quantity: number) {
		return this.gateway.quantity(id, version, quantity);
	}
	elements(id: string) {
		return this.gateway.elements(id);
	}
	updateElement(
		id: string,
		elementId: string,
		version: number,
		input: ElementUpdate,
	) {
		return this.gateway.updateElement(id, elementId, version, input);
	}
	removeElement(id: string, elementId: string, version: number) {
		return this.gateway.removeElement(id, elementId, version);
	}
	activity(id: string, query: CollectionQuery) {
		return this.gateway.activity(id, query);
	}
	initializeDesign(
		id: string,
		version: number,
		input: Readonly<Record<string, unknown>>,
	) {
		return this.gateway.initializeDesign(id, version, input);
	}
	saveDesign(
		id: string,
		version: number,
		input: Readonly<Record<string, unknown>>,
	) {
		return this.gateway.saveDesign(id, version, input);
	}
}
