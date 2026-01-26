import PrimaryActionButton from '../../ui/PrimaryActionButton'
import StatusOverlay from '../../ui/StatusOverlay'

type PartnerFoundProps = {
  onCancel: () => void
}

const PartnerFound = ({ onCancel }: PartnerFoundProps) => {
  return (
    <StatusOverlay
      accent
      badge="Партнер найден"
      title="Партнер найден!"
      subtitle="Сейчас подготовим начало диалога."
    >
      <PrimaryActionButton variant="ghost" onClick={onCancel}>
        Отмена
      </PrimaryActionButton>
    </StatusOverlay>
  )
}

export default PartnerFound
