import type { MappingConflict } from '@eqv/core';

/** One Korean line for a Mapping Conflict. */
export function describeConflict(conflict: MappingConflict): string {
  switch (conflict.kind) {
    case 'transfer-without-capability':
      return `이송 ${conflict.from} → ${conflict.to} (${conflict.count}건): ${conflict.fromComponentId}와 ${conflict.toComponentId} 사이에 Transfer Capability가 없습니다`;
    case 'slot-exceeds-sites':
      return `slot ${conflict.slots.join(', ')}에 해당하는 Holding Site가 ${conflict.componentId}에 없습니다`;
    case 'role-mismatch':
      return `Role 불일치: ${conflict.moduleType}은(는) ${conflict.expectedRole}이어야 하지만 ${conflict.componentId}는 ${conflict.componentRole}입니다`;
    case 'port-flag-mismatch':
      return `Port 표시 불일치: 관측된 isPort=${conflict.isPort}이(가) ${conflict.componentId}의 Holding Site 구성과 다릅니다`;
    case 'robot-flag-mismatch':
      return `Robot 표시 불일치: 관측된 isRobot=${conflict.isRobot}이(가) ${conflict.componentId}의 Role과 다릅니다`;
  }
}
