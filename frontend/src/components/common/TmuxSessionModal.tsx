import { useState } from "react";

interface TmuxSession {
  name: string;
  windows: number;
  attached: boolean;
  created: string;
}

interface TmuxSessionModalProps {
  sessions: TmuxSession[];
  onSelect: (sessionName: string) => void;  // "" = 새 세션
  onDelete: (sessionName: string) => void;
}

export default function TmuxSessionModal({ sessions: initialSessions, onSelect, onDelete }: TmuxSessionModalProps) {
  const [sessions, setSessions] = useState(initialSessions);

  const handleDelete = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    setSessions((prev) => prev.filter((s) => s.name !== name));
    onDelete(name);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#18181b] border border-[#3f3f46] rounded-lg shadow-2xl w-[480px] max-w-[90vw]">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-[#3f3f46]">
          <h2 className="text-sm font-semibold text-[#f4f4f5]">터미널 세션 선택</h2>
          <p className="text-xs text-[#71717a] mt-0.5">
            이 서버에 살아있는 tmux 세션이 있습니다. 이어받거나 새 세션을 시작할 수 있습니다.
          </p>
        </div>

        {/* 세션 목록 */}
        <div className="px-4 py-3 flex flex-col gap-2 max-h-64 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="text-xs text-[#52525b] text-center py-4">세션이 없습니다. 새 세션을 시작하세요.</p>
          ) : sessions.map((s) => (
            <div
              key={s.name}
              className="flex items-center gap-2 group"
            >
              <button
                onClick={() => onSelect(s.name)}
                className="flex-1 flex items-center justify-between px-3 py-2.5 rounded bg-[#27272a] hover:bg-[#3f3f46] border border-[#3f3f46] hover:border-[#52525b] transition-colors text-left group/btn min-w-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.attached ? "bg-[#10b981]" : "bg-[#52525b]"}`} />
                  <span className="text-sm font-mono text-[#f4f4f5] truncate">{s.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <span className="text-xs text-[#71717a]">{s.windows}창</span>
                  {s.attached && (
                    <span className="text-[10px] bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 px-1.5 py-0.5 rounded">
                      연결중
                    </span>
                  )}
                  <span className="text-xs text-[#3b82f6] opacity-0 group-hover/btn:opacity-100 transition-opacity">
                    이어받기 →
                  </span>
                </div>
              </button>
              {/* 삭제 버튼 */}
              <button
                onClick={(e) => handleDelete(e, s.name)}
                title="세션 삭제"
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[#71717a] hover:text-[#ef4444] hover:bg-[#ef4444]/10 opacity-0 group-hover:opacity-100 transition-all"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* 하단 버튼 */}
        <div className="px-4 py-3 border-t border-[#3f3f46] flex justify-between items-center">
          <span className="text-xs text-[#52525b]">세션을 선택하거나 새로 시작하세요</span>
          <button
            onClick={() => onSelect("")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
          >
            + 새 세션 시작
          </button>
        </div>
      </div>
    </div>
  );
}
