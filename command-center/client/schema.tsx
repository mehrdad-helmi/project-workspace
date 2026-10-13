import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
	ReactFlow,
	Background,
	Controls,
	MiniMap,
	Handle,
	Position,
	useNodesState,
	type Node,
	type Edge,
	type NodeProps,
	MarkerType,
} from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Database, KeyRound, Link2, RefreshCw, X } from 'lucide-react';
import type { SchemaGraph, SchemaModel } from '../shared/contracts';
import { api } from './api';
import { ErrorBox, Loading } from './ui';
import '@xyflow/react/dist/style.css';

type ModelNode = Node<{ model: SchemaModel; selectedModel: boolean }, 'model'>;
function ModelTable({ data }: NodeProps<ModelNode>) {
	const model = data.model;
	return (
		<div className={`schema-table ${data.selectedModel ? 'selected' : ''}`}>
			<Handle type="target" position={Position.Left} />
			<div className="schema-table-title">
				<Database size={14} />
				<strong>{model.name}</strong>
				<span className="mono">{model.fields.length}</span>
			</div>
			{model.fields
				.filter((field) => field.kind !== 'object')
				.map((field) => (
					<div className="schema-field" key={field.name}>
						<span className="field-key">
							{field.isId ? (
								<KeyRound size={11} />
							) : model.fields.some((relation) =>
									relation.relationFromFields?.includes(field.name),
							  ) ? (
								<Link2 size={11} />
							) : null}
						</span>
						<span>{field.name}</span>
						<span className="mono muted">
							{field.type}
							{field.isList ? '[]' : !field.isRequired ? '?' : ''}
						</span>
					</div>
				))}
			<Handle type="source" position={Position.Right} />
		</div>
	);
}
const nodeTypes = { model: ModelTable };
export function SchemaPage() {
	const query = useQuery({ queryKey: ['schema'], queryFn: () => api<SchemaGraph>('schema') });
	const [nodes, setNodes, onNodesChange] = useNodesState<ModelNode>([]);
	const [edges, setEdges] = useState<Edge[]>([]);
	const [selected, setSelected] = useState('');
	const [search, setSearch] = useState('');
	const [file, setFile] = useState('');
	const [layoutError, setLayoutError] = useState('');
	const files = useMemo(
		() => [...new Set(query.data?.models.map((model) => model.sourceFile))].sort(),
		[query.data],
	);
	const models = useMemo(
		() => query.data?.models.filter((model) => !file || model.sourceFile === file) ?? [],
		[query.data, file],
	);
	useEffect(() => {
		if (query.data && file && !files.includes(file)) setFile('');
	}, [query.data, file, files]);
	useEffect(() => {
		setSelected((current) => (models.some((model) => model.name === current) ? current : ''));
		if (!models.length) {
			setNodes([]);
			setEdges([]);
			return;
		}
		let alive = true;
		const modelNames = new Set(models.map((model) => model.name));
		const relationEdges: Edge[] = [];
		const keys = new Set<string>();
		for (const model of models)
			for (const field of model.fields.filter(
				(field) => field.kind === 'object' && modelNames.has(field.type),
			)) {
				const key = `${[model.name, field.type].sort().join(':')}:${field.relationName}`;
				if (keys.has(key)) continue;
				const inverse = models
					.find((target) => target.name === field.type)
					?.fields.find(
						(candidate) =>
							candidate.kind === 'object' &&
							candidate.type === model.name &&
							candidate.relationName === field.relationName &&
							(model.name !== field.type || candidate.name !== field.name),
					);
				if (!field.relationFromFields?.length && inverse?.relationFromFields?.length) continue;
				keys.add(key);
				const count = (isList: boolean, required: boolean) =>
					isList ? 'many' : required ? '1' : '0..1';
				relationEdges.push({
					id: key,
					source: model.name,
					target: field.type,
					label: `${count(inverse?.isList ?? true, inverse?.isRequired ?? false)} : ${count(field.isList, field.isRequired)}`,
					type: 'smoothstep',
					markerEnd: { type: MarkerType.ArrowClosed, color: '#737C8E' },
					style: { stroke: '#555E70', strokeWidth: 1 },
					labelStyle: { fill: '#B5B8C2', fontSize: 10 },
					labelBgStyle: { fill: '#101115' },
					data: { relation: field.relationName },
				});
			}
		const layout = new ELK();
		layout
			.layout({
				id: 'schema',
				layoutOptions: {
					'elk.algorithm': 'layered',
					'elk.direction': 'RIGHT',
					'elk.spacing.nodeNode': '45',
					'elk.layered.spacing.nodeNodeBetweenLayers': '100',
				},
				children: models.map((model) => ({
					id: model.name,
					width: 295,
					height: 40 + model.fields.filter((field) => field.kind !== 'object').length * 24,
				})),
				edges: relationEdges.map((edge) => ({
					id: edge.id,
					sources: [edge.source],
					targets: [edge.target],
				})),
			})
			.then((result) => {
				if (!alive) return;
				setNodes(
					models.map((model) => {
						const position = result.children!.find((node) => node.id === model.name)!;
						return {
							id: model.name,
							type: 'model',
							position: { x: position.x ?? 0, y: position.y ?? 0 },
							data: { model, selectedModel: false },
						};
					}),
				);
				setEdges(relationEdges);
				setLayoutError('');
			})
			.catch((error) => {
				if (alive) setLayoutError(String(error));
			});
		return () => {
			alive = false;
		};
	}, [models, setNodes]);
	const visibleNodes = useMemo(
		() =>
			nodes.map((node) => ({
				...node,
				data: { ...node.data, selectedModel: node.id === selected },
				style: {
					opacity: search && !node.id.toLowerCase().includes(search.toLowerCase()) ? 0.25 : 1,
				},
			})),
		[nodes, selected, search],
	);
	const visibleEdges = edges.map((edge) => ({
		...edge,
		style: {
			...edge.style,
			stroke:
				selected && (edge.source === selected || edge.target === selected) ? '#F08439' : '#555E70',
			opacity: selected && edge.source !== selected && edge.target !== selected ? 0.15 : 1,
		},
	}));
	if (query.isPending) return <Loading />;
	if (query.error) return <ErrorBox error={query.error} />;
	const graph = query.data!;
	const model = models.find((model) => model.name === selected);
	return (
		<div className="schema-page">
			<div className="view-heading">
				<div>
					<h1>Schema explorer</h1>
					<p className="muted mono">
						BACKEND / PRISMA · {models.length} MODELS · {graph.enums.length} ENUMS
					</p>
				</div>
				<div className="toolbar">
					<select
						aria-label="Schema file"
						value={file}
						onChange={(event) => {
							setFile(event.target.value);
							setSelected('');
						}}
					>
						<option value="">All files</option>
						{files.map((path) => (
							<option key={path} value={path}>
								{path}
							</option>
						))}
					</select>
					<input
						aria-label="Search schema models"
						placeholder="Find a model…"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
					/>
					<button onClick={() => void query.refetch()} disabled={query.isFetching}>
						<RefreshCw size={16} />
						Refresh
					</button>
				</div>
			</div>
			{graph.stale && (
				<div className="inline-error">
					<strong>Schema changed · displaying the last valid diagram</strong>
					<pre>{graph.error}</pre>
				</div>
			)}
			{layoutError && <ErrorBox error={layoutError} />}
			<div className="schema-layout">
				<div className="schema-canvas">
					<ReactFlow
						key={nodes.map((node) => node.id).join(',')}
						nodes={visibleNodes}
						edges={visibleEdges}
						nodeTypes={nodeTypes}
						onNodesChange={onNodesChange}
						onNodeClick={(_event, node) => setSelected(node.id)}
						onPaneClick={() => setSelected('')}
						fitView
						minZoom={0.1}
						maxZoom={2}
						colorMode="dark"
						nodesConnectable={false}
						proOptions={{ hideAttribution: true }}
					>
						<Background color="#262A33" gap={24} />
						<Controls showInteractive={false} />
						<MiniMap pannable zoomable nodeColor="#9768D9" maskColor="#08090CCC" />
					</ReactFlow>
				</div>
				<aside className="schema-inspector">
					{model ? (
						<>
							<div className="panel-header">
								<h2>{model.name}</h2>
								<button aria-label="Clear model selection" onClick={() => setSelected('')}>
									<X size={16} />
								</button>
							</div>
							<div className="inspector-body">
								<p className="mono muted">TABLE {model.dbName ?? model.name}</p>
								<p className="mono muted">{model.sourceFile}</p>
								<h3>Fields and relations</h3>
								{model.fields.map((field) => (
									<div className="inspector-field" key={field.name}>
										<strong>{field.name}</strong>
										<span className="mono">
											{field.type}
											{field.isList ? '[]' : !field.isRequired ? '?' : ''}
										</span>
										<small>
											{[
												field.isId && 'Primary key',
												field.isUnique && 'Unique',
												field.dbName && `Column ${field.dbName}`,
												field.relationName && `Relation ${field.relationName}`,
												field.relationFromFields?.length &&
													`FK ${field.relationFromFields.join(', ')} → ${field.relationToFields?.join(', ')}`,
											]
												.filter(Boolean)
												.join(' · ')}
										</small>
										{field.default !== undefined && (
											<small className="mono">Default {JSON.stringify(field.default)}</small>
										)}
									</div>
								))}
								<h3>Constraints and indexes</h3>
								<pre>
									{JSON.stringify(
										{
											primaryKey: model.primaryKey,
											uniqueFields: model.uniqueFields,
											uniqueIndexes: model.uniqueIndexes,
											indexes: model.indexes,
										},
										null,
										2,
									)}
								</pre>
							</div>
						</>
					) : (
						<div className="inspector-body">
							<h2>Model directory</h2>
							<p className="muted">
								Select a model to inspect fields and highlight its relationships.
							</p>
							{models
								.filter((model) => model.name.toLowerCase().includes(search.toLowerCase()))
								.map((model) => (
									<button
										className="model-link"
										key={model.name}
										onClick={() => setSelected(model.name)}
									>
										<Database size={14} />
										{model.name}
									</button>
								))}
						</div>
					)}
					<div className="inspector-body">
						<h3>Enums</h3>
						{graph.enums.map((item) => (
							<details key={item.name}>
								<summary>{item.name}</summary>
								<div className="tags">
									{item.values.map((value) => (
										<span key={value.name} className="tag">
											{value.name}
										</span>
									))}
								</div>
							</details>
						))}
					</div>
				</aside>
			</div>
		</div>
	);
}
