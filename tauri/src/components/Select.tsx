import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

type Props = {
  id?: string;
  "aria-label"?: string;
  value: string;
  disabled?: boolean;
  children: ReactNode;
  onValueChange: (value: string) => void;
  className?: string;
};
/** A compact listbox with consistent WebKit/Chromium styling and full keyboard selection. */
export function Select({
  id,
  value,
  disabled,
  children,
  onValueChange,
  className = "",
  "aria-label": label,
}: Props) {
  const unique = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [position, setPosition] = useState({ top: 0, left: 0, width: 160 });
  const entries = Children.toArray(children).flatMap((child) =>
    isValidElement<{ value?: string; children?: ReactNode }>(child)
      ? [
          {
            value: String(child.props.value ?? child.props.children ?? ""),
            label: child.props.children,
          },
        ]
      : [],
  );
  const selected = entries.findIndex((o) => o.value === value);
  function show() {
    if (disabled || trigger.current?.matches(":disabled")) return;
    setActive(Math.max(0, selected));
    setOpen(true);
  }
  function choose(index: number) {
    const item = entries[index];
    if (item) {
      onValueChange(item.value);
      setOpen(false);
      trigger.current?.focus();
    }
  }
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current) return;
      const rect = trigger.current.getBoundingClientRect(),
        height = Math.min(250, entries.length * 36 + 12),
        width = Math.max(rect.width, 150);
      setPosition({
        left: Math.min(rect.left, innerWidth - width - 12),
        top:
          rect.bottom + height + 8 > innerHeight
            ? Math.max(8, rect.top - height - 6)
            : rect.bottom + 6,
        width,
      });
    };
    place();
    document.addEventListener("scroll", place, true);
    return () => document.removeEventListener("scroll", place, true);
  }, [open, entries.length]);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    const resize = () => setOpen(false);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${unique}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, unique]);
  return (
    <>
      <button
        id={id}
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? unique : undefined}
        aria-activedescendant={open ? `${unique}-${active}` : undefined}
        disabled={disabled}
        className={`select-trigger ${className}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            e.stopPropagation();
            return;
          }
          if (e.key === "Tab") {
            setOpen(false);
            return;
          }
          if (
            ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(
              e.key,
            )
          ) {
            e.preventDefault();
            if (!open) {
              show();
              return;
            }
            if (e.key === "Enter" || e.key === " ") {
              choose(active);
              return;
            }
            setActive((index) =>
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? entries.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        entries.length - 1,
                        index + (e.key === "ArrowDown" ? 1 : -1),
                      ),
                    ),
            );
          } else if (e.key.length === 1) {
            const index = entries.findIndex((entry) =>
              String(entry.label).toLowerCase().startsWith(e.key.toLowerCase()),
            );
            if (index >= 0) {
              e.preventDefault();
              if (open) setActive(index);
              else choose(index);
            }
          }
        }}
      >
        <span>{entries[selected]?.label || entries[0]?.label || "Choose"}</span>
        <ChevronDown size={13} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={unique}
            role="listbox"
            aria-label={label || "Options"}
            className="select-menu"
            style={position}
          >
            {entries.map((entry, index) => (
              <button
                key={`${entry.value}-${index}`}
                id={`${unique}-${index}`}
                role="option"
                aria-selected={entry.value === value}
                tabIndex={-1}
                className={index === active ? "highlighted" : ""}
                onPointerDown={(e) => e.preventDefault()}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <span>{entry.label}</span>
                {entry.value === value && <Check size={13} />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
