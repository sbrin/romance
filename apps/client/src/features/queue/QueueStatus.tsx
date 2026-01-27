import StatusOverlay from '../../ui/StatusOverlay'

const QueueStatus = () => {
  return (
    <StatusOverlay
      pulse
      title="Ищем партнера…"
      subtitle="Обычно это занимает меньше минуты."
    >
    </StatusOverlay>
  )
}

export default QueueStatus
