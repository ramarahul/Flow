import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  Clock3,
  ListTodo,
  Settings2,
} from "lucide-react";

export type View = "timer" | "tasks" | "stats" | "settings";
const destinations = [
  { view: "timer", label: "Timer", icon: Clock3 },
  { view: "tasks", label: "Tasks", icon: ListTodo },
  { view: "stats", label: "Statistics", icon: BarChart3 },
  { view: "settings", label: "Settings", icon: Settings2 },
] as const;

export function AppHeader({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (view: View) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && menu.current)
        menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const navigate = (destination: View) => {
    if (menu.current) menu.current.open = false;
    onNavigate(destination);
    menu.current?.querySelector("summary")?.focus();
  };

  return (
    <header className="app-header">
      {view === "timer" ? (
        <span className="brand">
          flow<span className="brand-dot">.</span>
        </span>
      ) : (
        <div className="app-header-title">
          <button
            className="icon"
            aria-label="Back to timer"
            title="Back to timer"
            onClick={() => navigate("timer")}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <h1>
            {view === "tasks"
              ? "Your Tasks"
              : view === "stats"
                ? "Your Focus"
                : "Your Flow"}
          </h1>
        </div>
      )}
      <details
        className="app-menu"
        ref={menu}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            event.currentTarget.open = false;
        }}
      >
        <summary>
          Menu <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <nav aria-label="Main navigation">
          {destinations.map(({ view: destination, label, icon: Icon }) => (
            <button
              key={destination}
              aria-current={view === destination ? "page" : undefined}
              onClick={() => navigate(destination)}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
      </details>
    </header>
  );
}
