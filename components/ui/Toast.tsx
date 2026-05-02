type Props = {
  message: string | null
}

export default function Toast({ message }: Props) {
  if (!message) return null
  return (
    <div className="fixed left-1/2 -translate-x-1/2 px-4 py-2.5 bg-black dark:bg-white text-white dark:text-black text-sm rounded-full shadow-lg z-50 whitespace-nowrap"
      style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 12px)' }}
    >
      {message}
    </div>
  )
}
