import StatusOverlay from '../../ui/StatusOverlay'
import PrimaryActionButton from '../../ui/PrimaryActionButton'

type QueueStatusProps = {
  onCancel: () => void
}

const QueueStatus = ({ onCancel }: QueueStatusProps) => {
  return (
    <StatusOverlay
      pulse
      title="Ищем партнера…"
      subtitle="Обычно это занимает меньше минуты."
    >
      <PrimaryActionButton variant="ghost" onClick={onCancel}>
        Отмена
      </PrimaryActionButton>
    </StatusOverlay>
  )
}

export default QueueStatus
