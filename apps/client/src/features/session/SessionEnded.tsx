import PrimaryActionButton from '../../ui/PrimaryActionButton'
import StatusOverlay from '../../ui/StatusOverlay'

type SessionEndedProps = {
  onQueue: () => void
}

const SessionEnded = ({ onQueue }: SessionEndedProps) => {
  return (
    <StatusOverlay badge="Сессия завершена" title="Диалог завершен">
      <PrimaryActionButton onClick={onQueue}>В очередь</PrimaryActionButton>
    </StatusOverlay>
  )
}

export default SessionEnded
