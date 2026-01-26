import PrimaryActionButton from '../../ui/PrimaryActionButton'
import StatusOverlay from '../../ui/StatusOverlay'

type StartSearchProps = {
  onStart: () => void
}

const StartSearch = ({ onStart }: StartSearchProps) => {
  return (
    <StatusOverlay
      badge="Готовы начать?"
      title="Начнем поиск"
      subtitle="Нажмите кнопку, чтобы найти партнера для диалога."
    >
      <PrimaryActionButton onClick={onStart}>Начать поиск</PrimaryActionButton>
    </StatusOverlay>
  )
}

export default StartSearch
