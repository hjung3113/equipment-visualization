import type { ReactNode } from 'react';
import { CalendarClock, CalendarX2, Cpu, Inbox, ServerCrash, ShieldAlert } from 'lucide-react';
import { Callout } from '@ap/ui';
import { LoadingBlock, StateMessage } from '@eqv/ui';
import type { HostProps } from '../host-props.js';
import type { ReplayLoad } from '../use-replay-input.js';

export function Notices({ notices }: { notices: readonly string[] }) {
  return notices.map((notice) => <Callout key={notice} tone="blue" className="mb-2"><span role="status">{notice}</span></Callout>);
}

/** The state to show instead of the screen body, or null when the screen has verified data to draw. */
export function stateFor(props: HostProps, load: ReplayLoad | null): ReactNode {
  const { time } = props;
  if (time.kind === 'unsupported') {
    return <StateMessage icon={CalendarX2} title="이 화면에는 시간 구간이 적용되지 않습니다" body="호스트가 시간 컨텍스트를 이 화면에 적용하지 않아 구간을 알 수 없습니다. 기본 구간을 대신 쓰지 않습니다." />;
  }
  if (props.equipment === null) {
    return <StateMessage icon={Cpu} title="설비를 고르세요" body="호스트의 설비 선택(?equipment=)으로 설비를 정하면 이 화면이 열립니다." />;
  }
  if (time.kind === 'missing') {
    return <StateMessage icon={CalendarClock} title="시간 구간을 고르세요" body="호스트의 컨텍스트 바에서 시작·끝 시각을 적용하세요. 기본 구간을 대신 쓰지 않습니다." />;
  }
  if (time.kind === 'invalid') return <StateMessage tone="danger" icon={CalendarX2} title="시간 구간이 올바르지 않습니다" body={time.problem} />;
  if (load === null || load.kind === 'loading') return <LoadingBlock label="불러오는 중…" />;
  switch (load.kind) {
    case 'ready': return null;
    case 'empty':
      return <><Notices notices={load.notices} /><StateMessage icon={Inbox} title="이 구간에 표시할 Occurrence가 없습니다" body="선택한 설비와 시간 구간에 서버가 돌려준 데이터가 없습니다." /></>;
    case 'forbidden':
      return <StateMessage tone="warning" icon={ShieldAlert} title="접근 권한이 필요합니다" body="호스트가 인증 상태를 안내합니다." />;
    case 'failed':
      return <><Notices notices={load.notices} /><StateMessage tone={load.tone} icon={ServerCrash} title={load.title} body={<>{load.message} <span className="font-mono">오류 ID {load.errorId}</span></>} /></>;
  }
}
