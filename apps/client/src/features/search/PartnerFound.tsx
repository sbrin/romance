import PrimaryActionButton from '../../ui/PrimaryActionButton'
import StatusOverlay from '../../ui/StatusOverlay'

type PartnerFoundStatus = 'idle' | 'waiting' | 'started'

type PartnerFoundProps = {
  onCancel: () => void
  onStart: () => void
  status: PartnerFoundStatus
}

const subtitles: Record<PartnerFoundStatus, string> = {
  idle: 'Сейчас подготовим начало диалога.',
  waiting: 'Жду партнера.',
  started: 'Сессия начинается.',
}

const PartnerFound = ({ onCancel, onStart, status }: PartnerFoundProps) => {
  const isWaiting = status === 'waiting'
  const isStarted = status === 'started'

  return (
    <StatusOverlay
      accent
      badge="Партнер найден"
      title="Партнер найден!"
      subtitle={subtitles[status]}
    >
      {!isStarted && (
        <>
          <PrimaryActionButton onClick={onStart} disabled={isWaiting}>
            {isWaiting ? 'Жду партнера' : 'Начать'}
          </PrimaryActionButton>
        </>
      )}
      <PrimaryActionButton variant="ghost" onClick={onCancel}>
        Отмена
      </PrimaryActionButton>
    </StatusOverlay>
  )
}

export default PartnerFound
