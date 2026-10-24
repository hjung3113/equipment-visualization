import { useId, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MATERIAL_KINDS, PHYSICAL_INTERFACE_KINDS, type Component, type LayoutDocument, type MaterialKind, type PhysicalInterfaceEdge } from '@eqv/core';
import { isPortFree, type AddPhysicalInterfaceSpec, type AddTransferCapabilitySpec } from '@eqv/editor';
import { FormField } from '@eqv/ui';
import { Button, Checkbox, Label, PanelSectionTitle, Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectTrigger, SelectValue } from '@ap/ui';

const NEW_PORT = '__new__';

interface ConnectionsPanelProps {
  layout: LayoutDocument;
  component: Component;
  busy: boolean;
  onAddPhysicalInterface(spec: AddPhysicalInterfaceSpec): void;
  onRemovePhysicalInterface(id: string): void;
  onRemovePort(id: string): void;
  onAddHoldingSite(kinds: MaterialKind[]): void;
  onRemoveHoldingSite(id: string): void;
  onAddTransferCapability(spec: AddTransferCapabilitySpec): void;
  onRemoveTransferCapability(id: string): void;
}

function Choice({ label, value, onChange, disabled, children }: {
  label: string; value: string; onChange(value: string): void; disabled: boolean; children: ReactNode;
}) {
  return <FormField label={label}>
    {(control) => <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger {...control} density="compact"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>}
  </FormField>;
}

function DeleteItem({ id, busy, onDelete }: { id: string; busy: boolean; onDelete(id: string): void }) {
  return <Button type="button" variant="ghost" size="toolbar" aria-label={`${id} 삭제`} disabled={busy} onClick={() => onDelete(id)}>
    <Trash2 className="size-3.5" aria-hidden />
  </Button>;
}

export function ConnectionsPanel({ layout, component, busy, onAddPhysicalInterface, onRemovePhysicalInterface, onRemovePort,
  onAddHoldingSite, onRemoveHoldingSite, onAddTransferCapability, onRemoveTransferCapability }: ConnectionsPanelProps) {
  const checkboxId = useId();
  const [partnerId, setPartnerId] = useState('');
  const [kind, setKind] = useState('');
  const [portId, setPortId] = useState(NEW_PORT);
  const [partnerPortId, setPartnerPortId] = useState(NEW_PORT);
  const [materialKinds, setMaterialKinds] = useState<MaterialKind[]>(['wafer']);
  const [siteId, setSiteId] = useState('');
  const [otherSite, setOtherSite] = useState('');
  const [handlerId, setHandlerId] = useState('');

  // All options come from the current document, including after undo or a cascade.
  const partners = layout.components.filter((candidate) => candidate.id !== component.id);
  const partner = partners.find((candidate) => candidate.id === partnerId);
  const freePorts = (candidate: Component) => candidate.ports.filter((port) => isPortFree(layout, candidate.id, port.id));
  const ownPorts = freePorts(component);
  const partnerPorts = partner ? freePorts(partner) : [];
  const interfaces = layout.physicalInterfaces.filter((edge) => edge.a.componentId === component.id || edge.b.componentId === component.id);
  const canAddInterface = !!partner && PHYSICAL_INTERFACE_KINDS.some((candidate) => candidate === kind)
    && (portId === NEW_PORT || ownPorts.some((port) => port.id === portId))
    && (partnerPortId === NEW_PORT || partnerPorts.some((port) => port.id === partnerPortId));
  const robots = layout.components.filter((candidate) => candidate.role === 'robot');
  const siteOptions = layout.components.map((candidate) => ({ component: candidate, sites: candidate.holdingSites.filter((site) =>
    candidate.id !== component.id || site.id !== siteId) })).filter((group) => group.sites.length > 0);
  const siteKey = (componentId: string, holdingSiteId: string) => `${componentId}/${holdingSiteId}`;
  const destination = siteOptions.flatMap((group) => group.sites.map((site) => ({ componentId: group.component.id, holdingSiteId: site.id })))
    .find((endpoint) => siteKey(endpoint.componentId, endpoint.holdingSiteId) === otherSite);
  const canAddCapability = component.holdingSites.some((site) => site.id === siteId) && !!destination && robots.some((robot) => robot.id === handlerId);
  const capabilities = layout.transferCapabilities.filter((edge) => edge.a.componentId === component.id || edge.b.componentId === component.id || edge.handlerComponentId === component.id);

  return <div className="space-y-3">
    <section aria-label="Physical Interface" className="space-y-3">
      <PanelSectionTitle>Physical Interface</PanelSectionTitle>
      {interfaces.length === 0 && <p className="text-xs text-text-muted">Physical Interface가 없습니다.</p>}
      {interfaces.map((edge) => {
        const own = edge.a.componentId === component.id ? edge.a : edge.b;
        const other = edge.a.componentId === component.id ? edge.b : edge.a;
        return <div key={edge.id} className="flex items-center justify-between gap-2">
          <span className="text-sm">{edge.kind} · {other.componentId}/{other.portId} (포트 {own.portId})</span>
          <DeleteItem id={edge.id} busy={busy} onDelete={onRemovePhysicalInterface} />
        </div>;
      })}
      <div className="grid gap-3 lg:grid-cols-2">
        <Choice label="상대 Component" value={partnerId} disabled={busy} onChange={(value) => { setPartnerId(value); setPartnerPortId(NEW_PORT); }}>
          {partners.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.id} · {candidate.label}</SelectItem>)}
        </Choice>
        <Choice label="종류" value={kind} disabled={busy} onChange={setKind}>
          {PHYSICAL_INTERFACE_KINDS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
        </Choice>
        <Choice label="포트" value={portId} disabled={busy} onChange={setPortId}>
          <SelectItem value={NEW_PORT}>새 포트</SelectItem>
          {ownPorts.map((port) => <SelectItem key={port.id} value={port.id}>{port.id}</SelectItem>)}
        </Choice>
        <Choice label="상대 포트" value={partnerPortId} disabled={busy} onChange={setPartnerPortId}>
          <SelectItem value={NEW_PORT}>새 포트</SelectItem>
          {partnerPorts.map((port) => <SelectItem key={port.id} value={port.id}>{port.id}</SelectItem>)}
        </Choice>
      </div>
      <Button type="button" variant="secondary" size="toolbar" disabled={busy || !canAddInterface} onClick={() => {
        if (!canAddInterface || busy) return;
        onAddPhysicalInterface({ a: { componentId: component.id, portId: portId === NEW_PORT ? null : portId },
          b: { componentId: partnerId, portId: partnerPortId === NEW_PORT ? null : partnerPortId }, kind: kind as PhysicalInterfaceEdge['kind'] });
        setPartnerId(''); setKind(''); setPortId(NEW_PORT); setPartnerPortId(NEW_PORT);
      }}><Plus className="size-3.5" aria-hidden />Physical Interface 추가</Button>
    </section>
    <section aria-label="포트" className="space-y-3">
      <PanelSectionTitle>포트</PanelSectionTitle>
      {component.ports.length === 0 && <p className="text-xs text-text-muted">포트가 없습니다.</p>}
      {component.ports.map((port) => <div key={port.id} className="flex items-center justify-between gap-2">
        <span className="text-sm">{port.id} · Physical Interface {interfaces.filter((edge) =>
          (edge.a.componentId === component.id && edge.a.portId === port.id) || (edge.b.componentId === component.id && edge.b.portId === port.id)).length}개</span>
        <DeleteItem id={port.id} busy={busy} onDelete={onRemovePort} />
      </div>)}
    </section>
    <section aria-label="Holding Site" className="space-y-3">
      <PanelSectionTitle>Holding Site</PanelSectionTitle>
      {component.holdingSites.length === 0 && <p className="text-xs text-text-muted">Holding Site가 없습니다.</p>}
      {component.holdingSites.map((site) => <div key={site.id} className="flex items-center justify-between gap-2">
        <span className="text-sm">{site.id} · {site.materialKinds.join(', ')}</span>
        <DeleteItem id={site.id} busy={busy} onDelete={onRemoveHoldingSite} />
      </div>)}
      <div className="flex flex-wrap items-center gap-3">
        {MATERIAL_KINDS.map((value) => <span key={value} className="flex items-center gap-2">
          <Checkbox id={`${checkboxId}-${value}`} disabled={busy} checked={materialKinds.includes(value)} onCheckedChange={(checked) =>
            setMaterialKinds((previous) => checked === true ? [...previous, value] : previous.filter((candidate) => candidate !== value))} />
          <Label htmlFor={`${checkboxId}-${value}`}>{value}</Label>
        </span>)}
      </div>
      <Button type="button" variant="secondary" size="toolbar" disabled={busy || materialKinds.length === 0} onClick={() => {
        if (!busy && materialKinds.length > 0) onAddHoldingSite(materialKinds);
      }}><Plus className="size-3.5" aria-hidden />Holding Site 추가</Button>
    </section>
    <section aria-label="Transfer Capability" className="space-y-3">
      <PanelSectionTitle>Transfer Capability</PanelSectionTitle>
      {capabilities.length === 0 && <p className="text-xs text-text-muted">Transfer Capability가 없습니다.</p>}
      {capabilities.map((edge) => <div key={edge.id} className="flex items-center justify-between gap-2">
        <span className="text-sm">{edge.a.componentId}/{edge.a.holdingSiteId} ↔ {edge.b.componentId}/{edge.b.holdingSiteId} · Handler {edge.handlerComponentId}</span>
        <DeleteItem id={edge.id} busy={busy} onDelete={onRemoveTransferCapability} />
      </div>)}
      <div className="grid gap-3 lg:grid-cols-3">
        <Choice label="Holding Site" value={siteId} disabled={busy || component.holdingSites.length === 0} onChange={setSiteId}>
          {component.holdingSites.map((site) => <SelectItem key={site.id} value={site.id}>{site.id}</SelectItem>)}
        </Choice>
        <Choice label="상대 Holding Site" value={otherSite} disabled={busy} onChange={setOtherSite}>
          {siteOptions.map((group) => <SelectGroup key={group.component.id}>
            <SelectLabel>{group.component.id}</SelectLabel>
            {group.sites.map((site) => <SelectItem key={site.id} value={siteKey(group.component.id, site.id)}>{group.component.id}/{site.id}</SelectItem>)}
          </SelectGroup>)}
        </Choice>
        <Choice label="Handler" value={handlerId} disabled={busy} onChange={setHandlerId}>
          {robots.map((robot) => <SelectItem key={robot.id} value={robot.id}>{robot.id} · {robot.label}</SelectItem>)}
        </Choice>
      </div>
      {robots.length === 0 && <p className="text-xs text-text-muted">role이 robot인 Component가 없습니다.</p>}
      <Button type="button" variant="secondary" size="toolbar" disabled={busy || !canAddCapability} onClick={() => {
        if (!canAddCapability || !destination || busy) return;
        onAddTransferCapability({ a: { componentId: component.id, holdingSiteId: siteId }, b: destination, handlerComponentId: handlerId });
        setSiteId(''); setOtherSite(''); setHandlerId('');
      }}><Plus className="size-3.5" aria-hidden />Transfer Capability 추가</Button>
    </section>
  </div>;
}
