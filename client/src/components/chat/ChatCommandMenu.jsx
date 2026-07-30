import React from "react";

export function ChatCommandMenu({
  commands,
  activeIndex = 0,
  onHoverCommand,
  onSelectCommand,
}) {
  if (!Array.isArray(commands) || commands.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-black/40 p-2 shadow-xl backdrop-blur-xl">
      <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
        Commands
      </div>
      <div className="flex flex-col gap-1">
        {commands.map((command, index) => {
          const isActive = index === activeIndex;

          return (
            <button
              key={command.value}
              type="button"
              onMouseEnter={() => onHoverCommand?.(index)}
              onClick={() => onSelectCommand?.(command.value)}
              className={`flex w-full items-start justify-between gap-3 rounded-[1rem] px-3 py-2 text-left transition ${
                isActive
                  ? "bg-emerald-500/12 text-emerald-100"
                  : "bg-white/[0.02] text-zinc-200 hover:bg-white/[0.05]"
              }`}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold">{command.value}</div>
                <div className="mt-1 text-xs leading-5 text-zinc-400">
                  {command.description}
                </div>
              </div>
              <div className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {command.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
