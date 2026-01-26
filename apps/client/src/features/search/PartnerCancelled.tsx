import PrimaryActionButton from '../../ui/PrimaryActionButton'
import StatusOverlay from '../../ui/StatusOverlay'

type PartnerCancelledProps = {
  onStart: () => void
}

const PartnerCancelled = ({ onStart }: PartnerCancelledProps) => {
  return (
    <StatusOverlay badge="Чат отменен" title="Партнер отменил чат">
      <PrimaryActionButton onClick={onStart}>Начать поиск</PrimaryActionButton>
    </StatusOverlay>
  )
}

export default PartnerCancelled
