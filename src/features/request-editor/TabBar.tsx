import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTabsStore, type RequestTab } from "@/store/tabs";

function SortableTab({ tab, active }: { tab: RequestTab; active: boolean }) {
  const setActiveTab = useTabsStore((s) => s.setActiveTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex h-9 max-w-56 min-w-32 shrink-0 cursor-pointer items-center gap-2 border-r px-3 text-sm select-none",
        active
          ? "bg-background text-foreground"
          : "bg-muted/40 text-muted-foreground hover:bg-muted",
        isDragging && "z-10 opacity-70",
      )}
      onClick={() => setActiveTab(tab.id)}
      onAuxClick={(e) => {
        if (e.button === 1) closeTab(tab.id); // middle click closes
      }}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={active}
    >
      <span className="text-[10px] font-semibold tracking-wide">{tab.method}</span>
      <span className="flex-1 truncate">{tab.title}</span>
      {tab.dirty && (
        <span aria-label="Unsaved changes" className="size-1.5 rounded-full bg-primary" />
      )}
      <button
        type="button"
        aria-label={`Close ${tab.title}`}
        className="rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          closeTab(tab.id);
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const openTab = useTabsStore((s) => s.openTab);
  const moveTab = useTabsStore((s) => s.moveTab);

  // A small drag distance keeps plain clicks from starting a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = tabs.findIndex((t) => t.id === active.id);
    const to = tabs.findIndex((t) => t.id === over.id);
    if (from >= 0 && to >= 0) moveTab(from, to);
  }

  return (
    <div className="flex items-center border-b bg-muted/30" role="tablist">
      <div className="flex min-w-0 overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
            {tabs.map((tab) => (
              <SortableTab key={tab.id} tab={tab} active={tab.id === activeTabId} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="ml-1 size-8"
        aria-label="New request"
        onClick={() => openTab()}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
