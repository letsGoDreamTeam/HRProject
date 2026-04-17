import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

function KanbanColumn({ stage, label, count, children }) {
  const { isOver, setNodeRef } = useDroppable({ id: stage })
  return (
    <section
      ref={setNodeRef}
      className={`min-h-52 rounded-lg border bg-slate-50 p-3 transition-[box-shadow,background-color] duration-200 ease-out dark:bg-slate-950/40 ${
        isOver
          ? 'border-violet-400 shadow-md shadow-violet-500/10 ring-2 ring-violet-400/30 dark:border-violet-500 dark:ring-violet-500/25'
          : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
        {label} ({count})
      </h4>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function KanbanCardShell({ id, children }) {
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({ id })
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
    transition: isDragging ? undefined : 'transform 180ms cubic-bezier(0.25, 1, 0.5, 1)',
  }
  return (
    <article
      ref={setNodeRef}
      style={style}
      className="rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-1 dark:border-slate-800">
        <button
          type="button"
          className="cursor-grab touch-none rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 active:cursor-grabbing dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="드래그하여 단계 이동"
          {...listeners}
          {...attributes}
        >
          ⣿
        </button>
        <span className="text-[10px] text-slate-400">드래그</span>
      </div>
      <div className="p-2 pt-1">{children}</div>
    </article>
  )
}

export function ApplicationKanban({ stages, stageLabel, items, renderCard, onCommitMove }) {
  const [activeId, setActiveId] = useState(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const activeItem = items.find((i) => String(i.id) === activeId) || null

  const handleDragEnd = (event) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const targetStage = String(over.id)
    const item = items.find((i) => String(i.id) === String(active.id))
    if (!item) return
    const cur = item.stage || 'document_screening'
    if (cur === targetStage) return
    void onCommitMove(String(item.id), targetStage)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {stages.map((stage) => {
          const col = items.filter((x) => (x.stage || 'document_screening') === stage)
          return (
            <KanbanColumn key={stage} stage={stage} label={stageLabel[stage] || stage} count={col.length}>
              {col.map((it) => (
                <KanbanCardShell key={it.id} id={String(it.id)}>
                  {renderCard(it)}
                </KanbanCardShell>
              ))}
            </KanbanColumn>
          )
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {activeItem ? (
          <div className="max-w-[220px] cursor-grabbing rounded border border-violet-300 bg-white p-2 shadow-xl dark:border-violet-600 dark:bg-slate-900">
            {renderCard(activeItem)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
