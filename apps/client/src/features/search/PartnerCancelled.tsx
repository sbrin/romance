import PrimaryActionButton from '../../ui/PrimaryActionButton'
import StatusOverlay from '../../ui/StatusOverlay'

type PartnerCancelledProps = {
  onRestart: () => void
}

const PartnerCancelled = ({ onRestart }: PartnerCancelledProps) => {
  return (
    <StatusOverlay badge="Чат отменен" title="Партнер отменил чат">
      <PrimaryActionButton onClick={onRestart}>Начать поиск</PrimaryActionButton>
    </StatusOverlay>
  )
}

export default PartnerCancelled
