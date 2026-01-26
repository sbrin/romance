import { USER_ROLE, type UserRole } from '@romance/shared'
import PrimaryActionButton from '../../ui/PrimaryActionButton'

type RoleSelectProps = {
  onSelect: (role: UserRole) => void
  isSubmitting?: boolean
}

const RoleSelect = ({ onSelect, isSubmitting = false }: RoleSelectProps) => {
  return (
    <section className="role-select">
      <p className="eyebrow">Romance Chat</p>
      <h1 className="role-select__title display-font">Кто вы?</h1>
      <p className="role-select__subtitle">
        Мы подберем диалог с человеком противоположного пола.
      </p>
      <div className="role-select__actions">
        <PrimaryActionButton
          onClick={() => onSelect(USER_ROLE.MALE)}
          disabled={isSubmitting}
        >
          Мужчина
        </PrimaryActionButton>
        <PrimaryActionButton
          variant="ghost"
          onClick={() => onSelect(USER_ROLE.FEMALE)}
          disabled={isSubmitting}
        >
          Женщина
        </PrimaryActionButton>
      </div>
    </section>
  )
}

export default RoleSelect
