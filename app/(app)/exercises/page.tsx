'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, X } from 'lucide-react'
import type { UserExercise, ExerciseMaster, TargetMuscle } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'

type SortableItemProps = {
  exercise: UserExercise
  onDelete: (id: string) => void
}

function SortableItem({ exercise, onDelete }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: exercise.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-900"
    >
      <button
        className="text-zinc-300 dark:text-zinc-700 touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-black dark:text-white">
          {exercise.name}
        </span>
      </div>
      <span className="text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded-full flex-shrink-0">
        {TARGET_MUSCLE_LABELS[exercise.target_muscle]}
      </span>
      <button
        onClick={() => onDelete(exercise.id)}
        className="text-zinc-300 dark:text-zinc-700 hover:text-red-400 transition-colors flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

type AddModalProps = {
  onClose: () => void
  onAdd: () => void
}

function AddModal({ onClose, onAdd }: AddModalProps) {
  const [tab, setTab] = useState<'master' | 'custom'>('master')
  const [masters, setMasters] = useState<ExerciseMaster[]>([])
  const [customName, setCustomName] = useState('')
  const [customMuscle, setCustomMuscle] = useState<TargetMuscle>('chest')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/exercises/master')
      .then(r => r.json())
      .then(d => setMasters(d.exercises ?? []))
  }, [])

  const muscleOrder: TargetMuscle[] = ['chest', 'back', 'legs', 'shoulders', 'arms']
  const grouped = masters.reduce<Record<TargetMuscle, ExerciseMaster[]>>((acc, ex) => {
    const muscle = ex.target_muscle as TargetMuscle
    if (!acc[muscle]) acc[muscle] = []
    acc[muscle].push(ex)
    return acc
  }, {} as Record<TargetMuscle, ExerciseMaster[]>)

  const addMaster = async (exercise_master_id: string) => {
    setSaving(true)
    await fetch('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise_master_id }),
    })
    onAdd()
    onClose()
  }

  const addCustom = async () => {
    if (!customName.trim()) return
    setSaving(true)
    await fetch('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_name: customName.trim(), custom_target_muscle: customMuscle }),
    })
    onAdd()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-t-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-900">
          <h2 className="text-base font-semibold text-black dark:text-white">種目を追加</h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="flex border-b border-zinc-100 dark:border-zinc-900">
          {(['master', 'custom'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t
                  ? 'text-black dark:text-white border-b-2 border-black dark:border-white -mb-px'
                  : 'text-zinc-400 dark:text-zinc-500'
              }`}
            >
              {t === 'master' ? '一覧から選ぶ' : 'カスタム追加'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {tab === 'master' ? (
            <div className="space-y-6">
              {muscleOrder.map(muscle => {
                const exercises = grouped[muscle]
                if (!exercises?.length) return null
                return (
                  <div key={muscle}>
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                      {TARGET_MUSCLE_LABELS[muscle]}
                    </h3>
                    <div className="space-y-1.5">
                      {exercises.map(ex => (
                        <button
                          key={ex.id}
                          onClick={() => addMaster(ex.id)}
                          disabled={saving}
                          className="w-full text-left px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                        >
                          {ex.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">種目名</label>
                <input
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="例：ケーブルフライ"
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm outline-none focus:border-black dark:focus:border-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">部位</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['chest', 'back', 'legs', 'shoulders', 'arms'] as TargetMuscle[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setCustomMuscle(m)}
                      className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                        customMuscle === m
                          ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black'
                          : 'border-zinc-200 dark:border-zinc-800 text-black dark:text-white'
                      }`}
                    >
                      {TARGET_MUSCLE_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={addCustom}
                disabled={!customName.trim() || saving}
                className="w-full py-3.5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40 transition-opacity"
              >
                追加する
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ExercisesPage() {
  const [exercises, setExercises] = useState<UserExercise[]>([])
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const loadExercises = useCallback(async () => {
    const res = await fetch('/api/exercises')
    const data = await res.json()
    setExercises(data.exercises ?? [])
  }, [])

  useEffect(() => { loadExercises() }, [loadExercises])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = exercises.findIndex(e => e.id === active.id)
    const newIndex = exercises.findIndex(e => e.id === over.id)
    const reordered = arrayMove(exercises, oldIndex, newIndex)
    setExercises(reordered)

    await Promise.all(
      reordered.map((ex, i) =>
        fetch(`/api/exercises/${ex.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: i }),
        })
      )
    )
  }

  const handleDelete = async (id: string) => {
    setExercises(prev => prev.filter(e => e.id !== id))
    await fetch(`/api/exercises/${id}`, { method: 'DELETE' })
    setToast('種目を削除しました')
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-black dark:text-white">種目管理</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          追加
        </button>
      </div>

      <div className="px-6 py-4">
        {exercises.length === 0 ? (
          <div className="text-center py-20 text-zinc-400 dark:text-zinc-600">
            <p className="text-sm">種目がまだ登録されていません</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={exercises.map(e => e.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {exercises.map(ex => (
                  <SortableItem key={ex.id} exercise={ex} onDelete={handleDelete} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {showModal && (
        <AddModal
          onClose={() => setShowModal(false)}
          onAdd={loadExercises}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2.5 bg-black dark:bg-white text-white dark:text-black text-sm rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
