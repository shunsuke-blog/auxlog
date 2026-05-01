'use client'

import dynamic from 'next/dynamic'
import type { UserExercise, TrainingSet } from '@/types'

const VolumeChart = dynamic(() => import('./VolumeChart'), { ssr: false })

type Session = {
  id: string
  trained_at: string
  sets: TrainingSet[]
}

type Props = {
  sessions: Session[]
  exercises: UserExercise[]
}

export default function VolumeChartWrapper({ sessions, exercises }: Props) {
  return <VolumeChart sessions={sessions} exercises={exercises} />
}
